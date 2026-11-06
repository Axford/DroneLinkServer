// Standardized error response format
const sendErrorResponse = (res, statusCode, message, errors = null, code = null) => {
    const response = {
        success: false,
        message,
        timestamp: new Date().toISOString(),
        code: code || ({400:'validation',401:'unauthenticated',403:'forbidden',404:'not-found',409:'conflict',410:'invite-unavailable',500:'internal',503:'unavailable'})[statusCode] || 'request-failed'
    };

    if (errors) {
        response.errors = errors;
    }

    return res.status(statusCode).json(response);
};

// Async error handler wrapper
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

// Global error handler middleware
const errorHandler = (err, req, res, next) => {
    console.error('Request failed', { category: err.code || 'internal' });
    if (res.headersSent || res.destroyed) return;

    const known = {
        validation: [400, 'Validation failed'], 'invalid-id': [400, 'Invalid ID format'], duplicate: [409, 'Identity already exists'],
        conflict: [409, 'The record changed; refresh and try again'], unavailable: [503, 'Service temporarily unavailable'],
        unauthenticated: [401, 'Sign in required'], 'unverified-identity': [403, 'A verified Google email is required'], forbidden: [403, 'Access denied'],
        csrf: [403, 'Browser request verification failed'], 'not-found': [404, 'Record not found'], archived: [409, 'Domain is archived'],
        'invite-unavailable': [410, 'Invitation is unavailable'], 'invite-retired': [410, 'Shared invitation links are retired'],
        'last-owner': [409, 'Another Owner must accept before this Owner can leave or be demoted'],
        'method-not-allowed': [405, 'Permanent deletion is unavailable'], 'command-unavailable': [501, 'Command delivery is not available yet']
    };
    if (known[err.code]) { const [status, message] = known[err.code]; return sendErrorResponse(res, status, message, null, err.code === 'archived' ? 'domain-archived' : err.code); }
    if (err.type === 'entity.parse.failed') return sendErrorResponse(res, 400, 'Invalid JSON');

    // Default error
    return sendErrorResponse(res, 500, 'Internal server error');
};

module.exports = {
    sendErrorResponse,
    asyncHandler,
    errorHandler
};