const express = require('express');
const session = require('express-session');
const { Passport } = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const path = require('path');
const { validateDomainCreate, validateDomainUpdate, validatePagination } = require('./middleware/validation');
const { sendErrorResponse, asyncHandler, errorHandler } = require('./middleware/errorHandler');
const { mountClientHosting } = require('./lib/clientHosting');

const defaultGoogleStrategyFactory = (options, verify) => new GoogleStrategy(options, verify);

// Construct an application without loading configuration, connecting a database
// or opening a listener. Tests provide adapters through this composition seam;
// the production entrypoint always supplies real models and the default provider.
const createApp = ({ config, models, googleStrategyFactory = defaultGoogleStrategyFactory }) => {
    const { RxPacket, User, Domain } = models;
    const passport = new Passport();
    const app = express();

    // Security middleware with custom CSP for Google profile images, Bootstrap CDN, and Mapbox GL JS
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: [
                    "'self'",
                    "'unsafe-inline'",
                    "https://fonts.googleapis.com",
                    "https://cdn.jsdelivr.net"
                ],
                fontSrc: [
                    "'self'",
                    "https://fonts.gstatic.com",
                    "https://cdn.jsdelivr.net"
                ],
                imgSrc: [
                    "'self'",
                    "data:",
                    "blob:",
                    "https://lh3.googleusercontent.com",
                    "https://lh4.googleusercontent.com",
                    "https://lh5.googleusercontent.com",
                    "https://lh6.googleusercontent.com",
                    "https://api.mapbox.com",
                    "https://a.tiles.mapbox.com",
                    "https://b.tiles.mapbox.com",
                    "https://c.tiles.mapbox.com",
                    "https://d.tiles.mapbox.com"
                ],
                scriptSrc: [
                    "'self'",
                    "'unsafe-eval'",
                    "https://cdn.jsdelivr.net"
                ],
                workerSrc: [
                    "'self'",
                    "blob:"
                ],
                childSrc: [
                    "'self'",
                    "blob:"
                ],
                connectSrc: [
                    "'self'",
                    "https://api.mapbox.com",
                    "https://events.mapbox.com"
                ],
                frameSrc: ["'none'"],
                objectSrc: ["'none'"],
                mediaSrc: ["'self'"],
                manifestSrc: ["'self'"]
            }
        },
        hsts: false // Disable HSTS for localhost development
    }));

    // Rate limiting - more generous for development
    const limiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 1000, // limit each IP to 1000 requests per windowMs
        message: {
            success: false,
            message: 'Too many requests from this IP, please try again later.'
        }
    });

    const apiLimiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 500, // limit each IP to 500 API requests per windowMs
        message: {
            success: false,
            message: 'Too many API requests from this IP, please try again later.'
        }
    });

    // Temporarily disable rate limiting for development
    // app.use(limiter);
    // app.use('/api/', apiLimiter);

    // Middleware
    app.use(express.json({ limit: '10mb' }));
    app.use(session({
        secret: config.cookieKey,
        resave: false,
        saveUninitialized: true,
    }));
    app.use(passport.initialize());
    app.use(passport.session());

    // Serve static files
    app.use('/public', express.static(path.join(__dirname, 'public')));

    // Public login page route
    app.get('/public', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    // Default route
    app.get('/', (req, res) => {
        if (req.isAuthenticated()) {
            res.redirect('/private');
        } else {
            res.redirect('/public');
        }
    });

    // Passport configuration
    passport.use(googleStrategyFactory({
        clientID: config.googleClientID,
        clientSecret: config.googleClientSecret,
        callbackURL: "/auth/google/callback"
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
            let user = await User.findOne({ googleId: profile.id });
            if (user) {
                console.log('User found', user);
                user.lastSignInDate = new Date();
                await user.save();
                return done(null, user);
            } else {
                console.log('User not found, creating new user', profile);
                const newUser = new User({
                    displayName: profile.displayName,
                    email: profile.emails[0].value,
                    googleId: profile.id,
                    profilePicture: profile.photos[0].value,
                    createdAt: new Date(),
                    lastSignInDate: new Date()
                });
                await newUser.save();
                return done(null, newUser);
            }
        } catch (error) {
            return done(error, null);
        }
      }
    ));

    passport.serializeUser((user, done) => {
        done(null, user.id);
    });

    passport.deserializeUser(async (id, done) => {
        try {
            const user = await User.findById(id);
            done(null, user);
        } catch (error) {
            done(error, null);
        }
    });


    // Auth routes
    app.get('/auth/google',
      passport.authenticate('google', { scope: ['profile', 'email'] }));

    app.get('/auth/google/callback',
      passport.authenticate('google', { failureRedirect: '/public' }),
      (req, res) => {
        // Successful authentication, redirect to profile.
        res.redirect('/profile');
      });

    app.get('/auth/logout', (req, res, next) => {
        req.logout(err => {
            if (err) { return next(err); }
            res.redirect('/public');
        });
    });

    // Middleware to check authentication
    const ensureAuthenticated = (req, res, next) => {
        if (req.isAuthenticated()) {
            return next();
        }
        res.redirect('/public');
    };

    mountClientHosting(app, { clientBuildDir: config.clientBuildDir, ensureAuthenticated });

    // API for user data
    app.get('/api/user', ensureAuthenticated, (req, res) => {
        res.json(req.user);
    });

    // Update user's map state
    app.put('/api/user/map-state', ensureAuthenticated, asyncHandler(async (req, res) => {
        const { lng, lat, zoom } = req.body;

        // Validate input
        if (typeof lng !== 'number' || typeof lat !== 'number' || typeof zoom !== 'number') {
            return sendErrorResponse(res, 400, 'Invalid map state data. lng, lat, and zoom must be numbers.');
        }

        // Validate ranges
        if (lng < -180 || lng > 180 || lat < -90 || lat > 90 || zoom < 0 || zoom > 24) {
            return sendErrorResponse(res, 400, 'Map state values out of valid range.');
        }

        // Update user's map state
        await User.findByIdAndUpdate(req.user._id, {
            mapState: { lng, lat, zoom }
        });

        res.json({
            success: true,
            message: 'Map state updated successfully'
        });
    }));

    // API for user's domains with pagination
    app.get('/api/domains', ensureAuthenticated, validatePagination, asyncHandler(async (req, res) => {
        const { page, limit, skip, sort } = req.pagination;
        const { search, status } = req.query;

        // Build query
        const query = { users: req.user._id };

        if (search) {
            query.name = { $regex: search, $options: 'i' };
        }



        // Get total count for pagination
        const total = await Domain.countDocuments(query);

        // Get domains with pagination
        const domains = await Domain.find(query)
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .populate('createdBy', 'displayName email')
            .populate('users', 'displayName email profilePicture')
            .lean();

        // Ensure backward compatibility by adding default values for missing fields
        const crypto = require('crypto');
        const normalizedDomains = await Promise.all(domains.map(async (domain) => {
            const createdAt = domain.createdAt || domain._id.getTimestamp().toISOString();
            let updateFields = {};

            // Generate apiKey for domains that don't have one
            if (!domain.apiKey) {
                const newApiKey = crypto.randomBytes(32).toString('hex');
                updateFields.apiKey = newApiKey;
                domain.apiKey = newApiKey;
            }

            // Generate inviteToken for domains that don't have one
            if (!domain.inviteToken) {
                const newInviteToken = crypto.randomBytes(16).toString('hex');
                updateFields.inviteToken = newInviteToken;
                domain.inviteToken = newInviteToken;
            }

            // Set createdBy to first user if not set
            if (!domain.createdBy && domain.users && domain.users.length > 0) {
                updateFields.createdBy = domain.users[0];
                domain.createdBy = domain.users[0];
            }

            // Update the domain if we have fields to update
            if (Object.keys(updateFields).length > 0) {
                await Domain.findByIdAndUpdate(domain._id, updateFields);
            }

            return {
                ...domain,
                stats: domain.stats || { nodeCount: 0, packetCount: 0 },
                createdBy: domain.createdBy || null,
                createdAt: createdAt,
                updatedAt: domain.updatedAt || createdAt
            };
        }));

        res.json({
            success: true,
            data: normalizedDomains,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
                hasNext: page * limit < total,
                hasPrev: page > 1
            }
        });
    }));

    // Create a new domain
    app.post('/api/domains', ensureAuthenticated, validateDomainCreate, asyncHandler(async (req, res) => {
        const { name } = req.body;

        // Check if user already has a domain with this name
        const existingDomain = await Domain.findOne({
            name,
            users: req.user._id
        });

        if (existingDomain) {
            return sendErrorResponse(res, 409, 'You already have a domain with this name');
        }

        const newDomain = new Domain({
            name,
            users: [req.user._id],
            createdBy: req.user._id
        });

        await newDomain.save();

        await User.findByIdAndUpdate(
            req.user._id,
            { $push: { domains: newDomain._id } },
            { new: true, useFindAndModify: false }
        );

        // Populate the created domain for response
        const populatedDomain = await Domain.findById(newDomain._id)
            .populate('createdBy', 'displayName email')
            .populate('users', 'displayName email profilePicture');

        res.status(201).json({
            success: true,
            message: 'Domain created successfully',
            data: populatedDomain
        });
    }));

    // Get a single domain
    app.get('/api/domains/:id', ensureAuthenticated, asyncHandler(async (req, res) => {
        const domain = await Domain.findById(req.params.id)
            .populate('users', 'displayName email profilePicture')
            .populate('createdBy', 'displayName email');

        if (!domain) {
            return sendErrorResponse(res, 404, 'Domain not found');
        }

        // Check if user is part of the domain
        const userIsInDomain = domain.users.some(user => user._id.toString() === req.user._id.toString());
        if (!userIsInDomain) {
            return sendErrorResponse(res, 403, 'You are not authorized to view this domain');
        }

        res.json({
            success: true,
            data: domain
        });
    }));

    // Update a domain
    app.put('/api/domains/:id', ensureAuthenticated, validateDomainUpdate, asyncHandler(async (req, res) => {
        const { name } = req.body;

        const domain = await Domain.findById(req.params.id);
        if (!domain) {
            return sendErrorResponse(res, 404, 'Domain not found');
        }

        // Check if user is part of the domain
        const userIsInDomain = domain.users.some(user => user._id.toString() === req.user._id.toString());
        if (!userIsInDomain) {
            return sendErrorResponse(res, 403, 'You are not authorized to edit this domain');
        }

        // Check for duplicate name if name is being changed
        if (name !== domain.name) {
            const existingDomain = await Domain.findOne({
                name,
                users: req.user._id,
                _id: { $ne: req.params.id }
            });

            if (existingDomain) {
                return sendErrorResponse(res, 409, 'You already have a domain with this name');
            }
        }

        // Update name
        domain.name = name;
        await domain.save();

        const updatedDomain = await Domain.findById(domain._id)
            .populate('createdBy', 'displayName email')
            .populate('users', 'displayName email profilePicture');

        res.json({
            success: true,
            message: 'Domain updated successfully',
            data: updatedDomain
        });
    }));

    // Delete a domain
    app.delete('/api/domains/:id', ensureAuthenticated, asyncHandler(async (req, res) => {
        const domain = await Domain.findById(req.params.id);
        if (!domain) {
            return sendErrorResponse(res, 404, 'Domain not found');
        }

        const userIsInDomain = domain.users.some(user => user._id.toString() === req.user._id.toString());
        if (!userIsInDomain) {
            return sendErrorResponse(res, 403, 'You are not authorized to delete this domain');
        }

        // Remove the domain
        await domain.deleteOne();

        // Remove the domain reference from all associated users
        await User.updateMany(
            { _id: { $in: domain.users } },
            { $pull: { domains: domain._id } }
        );

        res.json({
            success: true,
            message: 'Domain deleted successfully'
        });
    }));

    // Regenerate domain API key
    app.post('/api/domains/:id/regenerate-key', ensureAuthenticated, asyncHandler(async (req, res) => {
        const domain = await Domain.findById(req.params.id);
        if (!domain) {
            return sendErrorResponse(res, 404, 'Domain not found');
        }

        const userIsInDomain = domain.users.some(user => user._id.toString() === req.user._id.toString());
        if (!userIsInDomain) {
            return sendErrorResponse(res, 403, 'You are not authorized to regenerate this domain\'s API key');
        }

        // Generate new API key
        const crypto = require('crypto');
        domain.apiKey = crypto.randomBytes(32).toString('hex');
        await domain.save();

        const updatedDomain = await Domain.findById(domain._id)
            .populate('createdBy', 'displayName email')
            .populate('users', 'displayName email profilePicture');

        res.json({
            success: true,
            message: 'API key regenerated successfully',
            data: updatedDomain
        });
    }));

    // Generate new invite link
    app.post('/api/domains/:id/regenerate-invite', ensureAuthenticated, asyncHandler(async (req, res) => {
        const domain = await Domain.findById(req.params.id);
        if (!domain) {
            return sendErrorResponse(res, 404, 'Domain not found');
        }

        const userIsInDomain = domain.users.some(user => user._id.toString() === req.user._id.toString());
        if (!userIsInDomain) {
            return sendErrorResponse(res, 403, 'You are not authorized to manage invites for this domain');
        }

        // Generate new invite token
        const crypto = require('crypto');
        const newInviteToken = crypto.randomBytes(16).toString('hex');

        // Use findByIdAndUpdate to avoid validation issues with missing fields
        await Domain.findByIdAndUpdate(req.params.id, {
            inviteToken: newInviteToken
        });

        const updatedDomain = await Domain.findById(req.params.id)
            .populate('createdBy', 'displayName email')
            .populate('users', 'displayName email profilePicture');

        res.json({
            success: true,
            message: 'Invite link regenerated successfully',
            data: updatedDomain
        });
    }));

    // Accept domain invite
    app.post('/api/invite/:token', ensureAuthenticated, asyncHandler(async (req, res) => {
        const domain = await Domain.findOne({ inviteToken: req.params.token });
        if (!domain) {
            return sendErrorResponse(res, 404, 'Invalid or expired invite link');
        }

        // Check if user is already a member
        const userIsAlreadyMember = domain.users.some(user => user._id.toString() === req.user._id.toString());
        if (userIsAlreadyMember) {
            return sendErrorResponse(res, 409, 'You are already a member of this domain');
        }

        // Add user to domain
        domain.users.push(req.user._id);
        await domain.save();

        // Add domain to user's domains
        await User.findByIdAndUpdate(
            req.user._id,
            { $push: { domains: domain._id } },
            { new: true, useFindAndModify: false }
        );

        const updatedDomain = await Domain.findById(domain._id)
            .populate('createdBy', 'displayName email')
            .populate('users', 'displayName email profilePicture');

        res.json({
            success: true,
            message: `Successfully joined domain "${domain.name}"`,
            data: updatedDomain
        });
    }));

    // Get invite info (for preview before accepting)
    app.get('/api/invite/:token', asyncHandler(async (req, res) => {
        const domain = await Domain.findOne({ inviteToken: req.params.token })
            .populate('createdBy', 'displayName email')
            .select('name createdBy createdAt');

        if (!domain) {
            return sendErrorResponse(res, 404, 'Invalid or expired invite link');
        }

        res.json({
            success: true,
            data: {
                domainName: domain.name,
                createdBy: domain.createdBy,
                createdAt: domain.createdAt
            }
        });
    }));

    // Get historical messages for a domain
    app.get('/api/domains/:id/messages', ensureAuthenticated, asyncHandler(async (req, res) => {
        const domain = await Domain.findById(req.params.id);
        if (!domain) {
            return sendErrorResponse(res, 404, 'Domain not found');
        }

        // Check if user is part of the domain
        const userIsInDomain = domain.users.some(user => user._id.toString() === req.user._id.toString());
        if (!userIsInDomain) {
            return sendErrorResponse(res, 403, 'You are not authorized to view this domain\'s messages');
        }

        // Parse query parameters
        const since = req.query.since ? new Date(req.query.since) : new Date(Date.now() - 60 * 60 * 1000); // Default: last hour
        const limit = parseInt(req.query.limit) || 1000; // Default: 1000 messages

        try {
            // Fetch messages from rxPackets collection
            const messages = await RxPacket.find({
                domain: req.params.id,
                time: { $gte: since }
            })
            .sort({ time: 1 }) // Oldest first for proper state building
            .limit(limit)
            .lean();

            res.json({
                success: true,
                data: messages,
                count: messages.length,
                since: since.toISOString()
            });
        } catch (error) {
            console.error('Error fetching historical messages:', error);
            return sendErrorResponse(res, 500, 'Failed to fetch historical messages');
        }
    }));

    // Get configuration values for frontend
    app.get('/api/config', ensureAuthenticated, (req, res) => {
        res.json({
            success: true,
            data: {
                mapboxAccessToken: config.mapboxAccessToken || null
            }
        });
    });

    // Send DroneLink message
    app.post('/api/send', ensureAuthenticated, asyncHandler(async (req, res) => {
        const { addr, msgType, values } = req.body;

        if (!addr || msgType === undefined || !values) {
            return sendErrorResponse(res, 400, 'Missing required fields: addr, msgType, values');
        }

        // TODO: Implement actual message sending to DroneLink network
        // For now, just log the message and return success
        console.log('DroneLink message send request:', { addr, msgType, values });

        res.json({
            success: true,
            message: 'Message queued for sending',
            data: { addr, msgType, values }
        });
    }));

    // Long-polling endpoint for real-time message streaming (compatible with time-series collections)
    app.get('/api/domains/:id/stream', ensureAuthenticated, asyncHandler(async (req, res) => {
        const domain = await Domain.findById(req.params.id);
        if (!domain) {
            return sendErrorResponse(res, 404, 'Domain not found');
        }

        // Check if user is part of the domain
        const userIsInDomain = domain.users.some(user => user._id.toString() === req.user._id.toString());
        if (!userIsInDomain) {
            return sendErrorResponse(res, 403, 'You are not authorized to stream this domain\'s messages');
        }

        // Get the 'since' parameter to know what messages to look for
        const since = req.query.since ? new Date(req.query.since) : new Date(Date.now() - 1000); // Default: last second
        const timeout = parseInt(req.query.timeout) || 30000; // Default: 30 seconds

        const startTime = Date.now();
        console.log(`Long-polling: Started for domain ${req.params.id}, since ${since.toISOString()}`);

        // Long-polling: check for new messages periodically
        const checkForNewMessages = async () => {
            try {
                const messages = await RxPacket.find({
                    domain: req.params.id,
                    time: { $gt: since }
                })
                .sort({ time: 1 })
                .limit(100) // Limit to prevent overwhelming
                .lean();

                if (messages.length > 0) {
                    // Found new messages, return them
                    console.log(`Long-polling: Returning ${messages.length} new messages for domain ${req.params.id}`);
                    return res.json({
                        success: true,
                        type: 'messages',
                        data: messages,
                        count: messages.length
                    });
                }

                // No new messages yet, check if we should continue polling
                const elapsed = Date.now() - startTime;
                if (elapsed >= timeout) {
                    // Timeout reached, return empty result
                    console.log(`Long-polling: Timeout reached for domain ${req.params.id} after ${elapsed}ms`);
                    return res.json({
                        success: true,
                        type: 'timeout',
                        data: [],
                        count: 0
                    });
                }

                // Wait a bit and check again
                setTimeout(checkForNewMessages, 1000); // Check every second
            } catch (error) {
                console.error('Error checking for new messages:', error);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to check for new messages'
                });
            }
        };

        // Handle client disconnect (normal for long-polling)
        req.on('close', () => {
            const elapsed = Date.now() - startTime;
            if (elapsed < 1000) {
                // Disconnected very quickly - might be unexpected
                console.log(`Long-polling: Client disconnected early after ${elapsed}ms for domain ${req.params.id}`);
            }
            // Normal disconnects after successful responses are expected and not logged
        });

        // Start checking for messages
        checkForNewMessages();
    }));

    // Profile route
    app.get('/profile', ensureAuthenticated, (req, res) => {
        res.redirect('/private');
    });




    // API routes
    app.post('/addPacket', async (req, res) => {
        try {
            if (!req.body) {
                console.log('Missing request body');
                return res.status(400).send('Missing request body');
            }

            const requiredFields = ['packet', 'id', 'node', 'channel', 'param', 'msgType', 'domain', 'apiKey'];
            const missingFields = requiredFields.filter(field => !(field in req.body));

            if (missingFields.length > 0) {
                console.log('Missing required fields', missingFields);
                return res.status(400).send(`Missing required fields: ${missingFields.join(', ')}`);
            }

            const { packet, id, node, channel, param, msgType, domain, apiKey } = req.body;

            // Find the domain and verify apiKey
            const targetDomain = await Domain.findOne({ _id: domain });

            if (!targetDomain) {
                console.log('Domain not found', domain);
                return res.status(404).send('Domain not found');
            }

            if (targetDomain.apiKey !== apiKey) {
                console.log('Invalid API key for domain', domain);
                return res.status(401).send('Invalid API key');
            }

            const newPacket = new RxPacket({
                time: new Date(),
                packet: Buffer.from(packet, 'base64'), // Assuming packet is sent as a base64 string
                domain: domain,
                meta: {
                    id,
                    node,
                    channel,
                    param,
                    msgType
                }
            });

            await newPacket.save();

            // Update domain stats
            await Domain.findByIdAndUpdate(domain, {
                $inc: { 'stats.packetCount': 1 }
            });

            res.status(201).send('Packet saved');
        } catch (error) {
            console.error(error);
            res.status(500).send('Error saving packet');
        }
    });

    // Add error handling middleware at the end
    app.use(errorHandler);

    return app;
};

module.exports = { createApp };
