const express = require('express');
const session = require('express-session');
const { Passport } = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { FirestoreSessions } = require('./lib/firestoreSessions');
const helmet = require('helmet');
const path = require('path');
const { mountObservationRoutes } = require('./lib/observationRoutes');
const { mountTelemetryRoutes } = require('./lib/telemetryRoutes');
const { mountPackedTelemetry } = require('./lib/packedTelemetry');
const { createAccessPolicy, fault } = require('./lib/accessPolicy');
const { mountAccessRoutes } = require('./lib/accessRoutes');
const { sendErrorResponse, asyncHandler, errorHandler } = require('./middleware/errorHandler');
const { mountClientHosting } = require('./lib/clientHosting');

const defaultGoogleStrategyFactory = (options, verify) => new GoogleStrategy(options, verify);

// Construct an application without loading configuration, connecting a database
// or opening a listener. Tests provide adapters through this composition seam;
// the production entrypoint always supplies real storage and the default provider.
const createApp = ({ config, store, googleStrategyFactory = defaultGoogleStrategyFactory }) => {
    const { users } = store;
    const policy = createAccessPolicy(store);
    const passport = new Passport();
    const app = express();

    const ready = asyncHandler(async (req, res, next) => {
        const control = await store.access.getControl(); if (control?.state !== 'ready') throw fault('unavailable'); next();
    });

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
    mountPackedTelemetry(app, { store, ready });
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
    app.use((req, res, next) => ['/addPacket', '/gateway/verify'].includes(req.path) ? next() : browserSession(req, res, next));
    app.use(passport.initialize());
    const restoreSession = passport.session();
    app.use((req, res, next) => ['/addPacket', '/gateway/verify'].includes(req.path) ? next() : restoreSession(req, res, next));

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

    passport.use(googleStrategyFactory({ clientID: config.googleClientID, clientSecret: config.googleClientSecret,
        callbackURL: new URL('/auth/google/callback', config.publicOrigin).href, state: true },
        async (accessToken, refreshToken, profile, done) => {
            try {
                const email = profile?.emails?.[0];
                // Pinned passport-google-oauth20 OpenID parser maps Google's email_verified to this boolean.
                if (!profile?.id || email?.verified !== true) return done(fault('unverified-identity'));
                const user = await users.registerVerifiedSignIn({ googleId: profile.id, email: email.value, emailVerified: true, displayName: profile.displayName, profilePicture: profile.photos?.[0]?.value });
                return done(null, user);
            } catch (error) { return done(error); }
        }));
    passport.serializeUser((user, done) => {
        store.access.getControl().then(control => done(null, { userId: user._id, googleId: user.googleId, emailCanonical: user.emailCanonical, emailVerified: true, sessionEpoch: control?.sessionEpoch || 0 }), done);
    });
    passport.deserializeUser(async (evidence, done) => {
        try { done(null, typeof evidence === 'object' && evidence?.userId ? await users.getById(evidence.userId) : false); }
        catch (error) { done(error); }
    });
    app.get('/auth/google', (req, res, next) => {
        const target = req.query.returnTo;
        if (target !== undefined && (typeof target !== 'string' || !/^\/invite\/[A-Za-z0-9_-]{1,200}\.[A-Za-z0-9_-]{43}$/.test(target))) return next(fault('validation'));
        req.session.inviteReturn = target ? { path: target, expiresAt: Date.now() + 600000 } : null;
        next();
    }, passport.authenticate('google', { scope: ['profile', 'email'] }));
    app.get('/auth/google/callback', (req, res, next) => {
        const invitation = req.session.inviteReturn;
        req.inviteReturn = invitation?.expiresAt > Date.now() ? invitation.path : null;
        next();
    }, passport.authenticate('google', { failureRedirect: '/public' }), (req, res, next) => {
        req.session.cookie.expires = new Date(req.session.validUntil);
        req.session.cookie.originalMaxAge = new Date(req.session.validUntil).getTime() - Date.now();
        policy.csrf(req);
        req.session.save(error => error ? next(error) : res.redirect(req.inviteReturn || '/profile'));
    });
    const ensureAuthenticated = asyncHandler(async (req, res, next) => {
        try { req.current = await policy.identity(req); }
        catch (error) { if (error.code === 'unauthenticated' && !req.path.startsWith('/api/')) return res.redirect('/public'); throw error; }
        if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
            if (req.get('Origin') !== config.publicOrigin || !req.session.csrfToken || req.get('X-CSRF-Token') !== req.session.csrfToken) throw fault('csrf');
            if (!req.is('application/json')) throw fault('validation');
        }
        next();
    });
    app.post('/auth/logout', ensureAuthenticated, (req, res, next) => req.logout(error => {
        if (error) return next(error);
        req.session.destroy(error => {
            if (error) return next(error);
            res.clearCookie('__session', { httpOnly: true, sameSite: 'lax', secure: config.publicOrigin.startsWith('https:') }); res.redirect('/public');
        });
    }));
    app.get('/auth/logout', (req, res) => res.status(405).set('Allow', 'POST').json({ success: false, code: 'method-not-allowed', message: 'Use the protected sign-out action' }));
    app.use(['/api/domains', '/api/invite', '/api/send'], ready);
    app.use('/invite', (req, res, next) => { res.set('Referrer-Policy', 'no-referrer'); res.set('Cache-Control', 'private, no-store'); next(); });
    mountClientHosting(app, { clientBuildDir: config.clientBuildDir, ensureAuthenticated });
    app.use('/api/domains/:id', asyncHandler(async (req, res, next) => {
        if (!config.observationEpoch || !['/messages', '/stream'].includes(req.path) || req.get('X-Observation-Contract') === '1') return next();
        await policy.domain(req);
        return sendErrorResponse(res, 426, 'Refresh the application to use shared observations. Historical packets require an explicit history client.', null, 'client-refresh-required');
    }));
    mountAccessRoutes(app, { store, policy, ensureAuthenticated, config });
    app.get('/profile', ensureAuthenticated, (req, res) => res.redirect('/private'));
    mountTelemetryRoutes(app, { store, ready, policy, ensureAuthenticated });
    mountObservationRoutes(app, { store, policy, ensureAuthenticated });
    app.use(errorHandler);
    return app;
};
module.exports = { createApp };
