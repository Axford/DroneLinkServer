const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const path = require('path');
const config = require('./config.json');
const RxPacket = require('./models/RxPacket');
const Node = require('./models/Node');
const User = require('./models/User');
const Domain = require('./models/Domain');
const { validateDomainCreate, validateDomainUpdate, validatePagination } = require('./middleware/validation');
const { sendErrorResponse, asyncHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();
const port = config.port;

// Security middleware with custom CSP for Google profile images and Bootstrap CDN
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
                "https://lh3.googleusercontent.com", 
                "https://lh4.googleusercontent.com", 
                "https://lh5.googleusercontent.com", 
                "https://lh6.googleusercontent.com"
            ],
            scriptSrc: [
                "'self'",
                "https://cdn.jsdelivr.net"
            ],
            connectSrc: ["'self'"],
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
app.use('/public', express.static('public'));

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
passport.use(new GoogleStrategy({
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


// MongoDB connection
console.log('Connecting to MongoDB', config.mongoURI);
mongoose.connect(config.mongoURI)
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.log(err));

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

// Serve static files for the React app (must come before route handlers)
app.use('/static', express.static(path.join(__dirname, 'private/build/static')));

// Serve React app assets (manifest, favicon, etc.) - these need to be accessible for invite pages
app.get('/manifest.json', (req, res) => {
    res.sendFile(path.join(__dirname, 'private/build/manifest.json'));
});
app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(__dirname, 'private/build/favicon.ico'));
});
app.get('/logo192.png', (req, res) => {
    res.sendFile(path.join(__dirname, 'private/build/logo192.png'));
});
app.get('/logo512.png', (req, res) => {
    res.sendFile(path.join(__dirname, 'private/build/logo512.png'));
});

// Serve private files
app.use('/private', ensureAuthenticated, express.static('private/build'));

// Serve invite pages (public access)
app.get('/invite/:token', (req, res) => {
    res.sendFile(path.join(__dirname, 'private/build', 'index.html'));
});

// API for user data
app.get('/api/user', ensureAuthenticated, (req, res) => {
    res.json(req.user);
});

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

// Update a domain
app.put('/api/domains/:id', ensureAuthenticated, validateDomainUpdate, asyncHandler(async (req, res) => {
    const { name } = req.body;

    const domain = await Domain.findById(req.params.id);
    if (!domain) {
        return sendErrorResponse(res, 404, 'Domain not found');
    }

    // Check if user is part of the domain
    if (!domain.users.includes(req.user._id)) {
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

    if (!domain.users.includes(req.user._id)) {
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

    if (!domain.users.includes(req.user._id)) {
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

    if (!domain.users.includes(req.user._id)) {
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
    if (domain.users.includes(req.user._id)) {
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

app.listen(port, () => {
    console.log(`Web server listening at http://localhost:${port}`);
}); 