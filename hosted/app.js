const express = require('express');
const session = require('express-session');
const { Passport } = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { FirestoreSessions } = require('./lib/firestoreSessions');
const helmet = require('helmet');
const path = require('path');
const { validateDomainCreate, validateDomainUpdate, validatePagination } = require('./middleware/validation');
const { sendErrorResponse, asyncHandler, errorHandler } = require('./middleware/errorHandler');
const { mountClientHosting } = require('./lib/clientHosting');

const defaultGoogleStrategyFactory = (options, verify) => new GoogleStrategy(options, verify);

// Construct an application without loading configuration, connecting a database
// or opening a listener. Tests provide adapters through this composition seam;
// the production entrypoint always supplies real storage and the default provider.
const createApp = ({ config, store, googleStrategyFactory = defaultGoogleStrategyFactory }) => {
    const { users, domains, packets } = store;
    const identifier = value => String(value?._id || value);
    const packetJSON = message => ({ ...message, packet: Buffer.isBuffer(message.packet) ? message.packet.toString('base64') : message.packet });
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

    // Middleware
    app.use(express.json({ limit: '10mb' }));
    app.set('trust proxy', 1);
    app.use((req, res, next) => {
        if (req.path.startsWith('/api/') || req.path.startsWith('/auth/') || req.path.startsWith('/private')) res.set('Cache-Control', 'private, no-store');
        next();
    });
    const browserSession = session({
        name: '__session', store: new FirestoreSessions(store.sessions), secret: config.cookieKey,
        resave: false, saveUninitialized: false,
        cookie: { secure: config.publicOrigin?.startsWith('https:') === true, httpOnly: true, sameSite: 'lax', maxAge: 600000 }
    });
    app.use((req, res, next) => req.path === '/addPacket' ? next() : browserSession(req, res, next));
    app.use((req, res, next) => {
        if (req.path !== '/addPacket' && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin && req.headers.origin !== config.publicOrigin) return sendErrorResponse(res, 403, 'Origin not allowed');
        next();
    });
    app.use(passport.initialize());
    const restoreSession = passport.session();
    app.use((req, res, next) => req.path === '/addPacket' ? next() : restoreSession(req, res, next));

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
        callbackURL: new URL('/auth/google/callback', config.publicOrigin || 'http://localhost:8003').href,
        state: true
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
            const user = await users.registerSignIn({
                displayName: profile.displayName, email: profile.emails?.[0]?.value,
                googleId: profile.id, profilePicture: profile.photos?.[0]?.value
            });
            return done(null, user);
        } catch (error) {
            return done(error, null);
        }
      }
    ));

    passport.serializeUser((user, done) => {
        done(null, user._id);
    });

    passport.deserializeUser(async (id, done) => {
        try {
            const user = await users.getById(id);
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
      (req, res, next) => {
        req.session.cookie.expires = new Date(req.session.validUntil);
        req.session.cookie.originalMaxAge = new Date(req.session.validUntil).getTime() - Date.now();
        req.session.save(error => error ? next(error) : res.redirect(req.user.stagingAccess ? '/profile' : '/access-pending'));
      });

    app.get('/access-pending', (req, res) => {
        res.set('Cache-Control', 'private, no-store').status(403).type('html').send('<h1>Access pending</h1><p>Your Dronewright staging account is awaiting approval. Once enabled, sign in again.</p><a href="/auth/logout">Sign out</a>');
    });
    app.get('/auth/logout', (req, res, next) => {
        req.logout(error => {
            if (error) return next(error);
            req.session.destroy(error => {
                if (error) return next(error);
                res.clearCookie('__session', { httpOnly: true, sameSite: 'lax', secure: config.publicOrigin?.startsWith('https:') === true });
                res.redirect('/public');
            });
        });
    });
    const ensureAuthenticated = (req, res, next) => {
        if (!req.isAuthenticated()) return req.path.startsWith('/api/') ? sendErrorResponse(res, 401, 'Sign in required') : res.redirect('/public');
        if (req.user.stagingAccess !== true) return req.path.startsWith('/api/') ? sendErrorResponse(res, 403, 'Access pending') : res.redirect('/access-pending');
        next();
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
        if (![lng, lat, zoom].every(Number.isFinite)) {
            return sendErrorResponse(res, 400, 'Invalid map state data. lng, lat, and zoom must be numbers.');
        }

        // Validate ranges
        if (lng < -180 || lng > 180 || lat < -90 || lat > 90 || zoom < 0 || zoom > 24) {
            return sendErrorResponse(res, 400, 'Map state values out of valid range.');
        }

        // Update user's map state
        await users.updateMapState(req.user._id, { lng, lat, zoom });

        res.json({
            success: true,
            message: 'Map state updated successfully'
        });
    }));

    // API for user's domains with pagination
    app.get('/api/domains', ensureAuthenticated, validatePagination, asyncHandler(async (req, res) => {
        const page = await domains.listForUser(req.user._id, req.pagination);
        res.json({ success: true, data: page.items, pagination: { nextCursor: page.nextCursor, limit: req.pagination.limit } });
    }));

    // Create a new domain
    app.post('/api/domains', ensureAuthenticated, validateDomainCreate, asyncHandler(async (req, res) => {
        const { name } = req.body;

        // Check if user already has a domain with this name
        const existingDomain = await domains.findNamedForUser(name, req.user._id);

        if (existingDomain) {
            return sendErrorResponse(res, 409, 'You already have a domain with this name');
        }

        const newDomain = await domains.createWithCreator({ name, createdBy: req.user._id });

        // Populate the created domain for response
        const populatedDomain = await domains.getDetails(newDomain._id);

        res.status(201).json({
            success: true,
            message: 'Domain created successfully',
            data: populatedDomain
        });
    }));

    // Get a single domain
    app.get('/api/domains/:id', ensureAuthenticated, asyncHandler(async (req, res) => {
        const domain = await domains.getDetails(req.params.id);

        if (!domain) {
            return sendErrorResponse(res, 404, 'Domain not found');
        }

        // Check if user is part of the domain
        const userIsInDomain = domain.users.some(user => identifier(user) === req.user._id);
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

        const domain = await domains.getById(req.params.id);
        if (!domain) {
            return sendErrorResponse(res, 404, 'Domain not found');
        }

        // Check if user is part of the domain
        const userIsInDomain = domain.users.some(user => identifier(user) === req.user._id);
        if (!userIsInDomain) {
            return sendErrorResponse(res, 403, 'You are not authorized to edit this domain');
        }

        // Check for duplicate name if name is being changed
        if (name !== domain.name) {
            const existingDomain = await domains.findNamedForUser(name, req.user._id, req.params.id);

            if (existingDomain) {
                return sendErrorResponse(res, 409, 'You already have a domain with this name');
            }
        }

        // Update name
        await domains.rename(domain._id, name, domain.revision);

        const updatedDomain = await domains.getDetails(domain._id);

        res.json({
            success: true,
            message: 'Domain updated successfully',
            data: updatedDomain
        });
    }));

    // Delete a domain
    app.delete('/api/domains/:id', ensureAuthenticated, asyncHandler(async (req, res) => {
        const domain = await domains.getById(req.params.id);
        if (!domain) {
            return sendErrorResponse(res, 404, 'Domain not found');
        }

        const userIsInDomain = domain.users.some(user => identifier(user) === req.user._id);
        if (!userIsInDomain) {
            return sendErrorResponse(res, 403, 'You are not authorized to delete this domain');
        }

        // Remove the domain
        await domains.deleteWithUserLinks(domain._id, domain.revision);

        res.json({
            success: true,
            message: 'Domain deleted successfully'
        });
    }));

    // Regenerate domain API key
    app.post('/api/domains/:id/regenerate-key', ensureAuthenticated, asyncHandler(async (req, res) => {
        const domain = await domains.getById(req.params.id);
        if (!domain) {
            return sendErrorResponse(res, 404, 'Domain not found');
        }

        const userIsInDomain = domain.users.some(user => identifier(user) === req.user._id);
        if (!userIsInDomain) {
            return sendErrorResponse(res, 403, 'You are not authorized to regenerate this domain\'s API key');
        }

        // Generate new API key
        const crypto = require('crypto');
        await domains.setApiKey(domain._id, crypto.randomBytes(32).toString('hex'), domain.revision);

        const updatedDomain = await domains.getDetails(domain._id);

        res.json({
            success: true,
            message: 'API key regenerated successfully',
            data: updatedDomain
        });
    }));

    // Generate new invite link
    app.post('/api/domains/:id/regenerate-invite', ensureAuthenticated, asyncHandler(async (req, res) => {
        const domain = await domains.getById(req.params.id);
        if (!domain) {
            return sendErrorResponse(res, 404, 'Domain not found');
        }

        const userIsInDomain = domain.users.some(user => identifier(user) === req.user._id);
        if (!userIsInDomain) {
            return sendErrorResponse(res, 403, 'You are not authorized to manage invites for this domain');
        }

        // Generate new invite token
        const crypto = require('crypto');
        const newInviteToken = crypto.randomBytes(16).toString('hex');

        // Use findByIdAndUpdate to avoid validation issues with missing fields
        await domains.setInviteToken(req.params.id, newInviteToken, domain.revision);

        const updatedDomain = await domains.getDetails(req.params.id);

        res.json({
            success: true,
            message: 'Invite link regenerated successfully',
            data: updatedDomain
        });
    }));

    // Accept domain invite
    app.post('/api/invite/:token', ensureAuthenticated, asyncHandler(async (req, res) => {
        const domain = await domains.findByInviteToken(req.params.token);
        if (!domain) {
            return sendErrorResponse(res, 404, 'Invalid or expired invite link');
        }

        // Check if user is already a member
        const userIsAlreadyMember = domain.users.some(user => identifier(user) === req.user._id);
        if (userIsAlreadyMember) {
            return sendErrorResponse(res, 409, 'You are already a member of this domain');
        }

        // Add user to domain
        await domains.addMemberAndLink(domain._id, req.user._id, { inviteToken: req.params.token });

        const updatedDomain = await domains.getDetails(domain._id);

        res.json({
            success: true,
            message: `Successfully joined domain "${domain.name}"`,
            data: updatedDomain
        });
    }));

    // Get invite info (for preview before accepting)
    app.get('/api/invite/:token', asyncHandler(async (req, res) => {
        const domain = await domains.findByInviteToken(req.params.token, true);

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
        const domain = await domains.getById(req.params.id);
        if (!domain) {
            return sendErrorResponse(res, 404, 'Domain not found');
        }

        // Check if user is part of the domain
        const userIsInDomain = domain.users.some(user => identifier(user) === req.user._id);
        if (!userIsInDomain) {
            return sendErrorResponse(res, 403, 'You are not authorized to view this domain\'s messages');
        }

        const page = await packets.readPage(packetOptions(req));
        res.json({ success: true, data: page.items.map(packetJSON), count: page.items.length,
            cursor: page.cursor, nextCursor: page.nextCursor, from: page.from, until: page.until });
    }));
    function packetOptions(req) {
        return { domainId: req.params.id, ...(req.query.cursor ? { cursor: req.query.cursor } : {}),
            ...(req.query.from || req.query.since ? { from: new Date(req.query.from || req.query.since) } : {}),
            ...(req.query.until ? { until: new Date(req.query.until) } : {}),
            limit: req.query.limit === undefined ? 1000 : Number(req.query.limit) };
    }
    app.get('/api/domains/:id/packet-count', ensureAuthenticated, asyncHandler(async (req, res) => {
        if (!await authorizeDomain(req, res)) return;
        res.json({ success: true, data: { retainedPacketCount: await packets.countRetained(req.params.id) } });
    }));
    async function authorizeDomain(req, res, recheck = false) {
        const user = recheck ? await users.getById(req.user._id) : req.user;
        if (!user?.stagingAccess) { sendErrorResponse(res, 403, 'Access pending'); return false; }
        const domain = await domains.getById(req.params.id);
        if (!domain) { sendErrorResponse(res, 404, 'Domain not found'); return false; }
        if (!domain.users.some(user => identifier(user) === req.user._id)) { sendErrorResponse(res, 403, 'Domain access denied'); return false; }
        return true;
    }

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
        return sendErrorResponse(res, 501, 'Command delivery is not available yet');
    }));

    // Long-polling endpoint for real-time message streaming (compatible with time-series collections)
    app.get('/api/domains/:id/stream', ensureAuthenticated, asyncHandler(async (req, res) => {
        if (!await authorizeDomain(req, res)) return;
        const controller = new AbortController();
        const cancel = () => controller.abort();
        res.once('close', cancel);
        try {
            const page = await packets.waitForPage({ ...packetOptions(req),
                timeoutMs: req.query.timeout === undefined ? 30000 : Number(req.query.timeout), signal: controller.signal });
            if (res.destroyed) return;
            const session = await store.sessions.get(req.sessionID);
            if (!session || session.data.passport?.user !== req.user._id) return sendErrorResponse(res, 401, 'Sign in required');
            if (!await authorizeDomain(req, res, true)) return;
            res.json({ success: true, type: page.items.length ? 'messages' : 'timeout',
                data: page.items.map(packetJSON), count: page.items.length, cursor: page.cursor, nextCursor: page.nextCursor });
        } catch (error) { if (!controller.signal.aborted) throw error; }
        finally { controller.abort(); res.off('close', cancel); }
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

            if (typeof packet !== 'string' || packet.length > 87384 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(packet) || !packet.length) return sendErrorResponse(res, 400, 'Invalid base64 packet');
            // Find the domain and verify apiKey
            const targetDomain = await domains.getById(domain);

            if (!targetDomain) {
                console.log('Domain not found', domain);
                return res.status(404).send('Domain not found');
            }

            if (targetDomain.apiKey !== apiKey) {
                console.log('Invalid API key for domain', domain);
                return res.status(401).send('Invalid API key');
            }

            await packets.enqueue({
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

            res.status(202).send('Packet received');
        } catch (error) {
            return errorHandler(error, req, res);
        }
    });

    // Add error handling middleware at the end
    app.use(errorHandler);

    return app;
};

module.exports = { createApp };
