// Standardized error response format
const sendErrorResponse = (res, statusCode, message, errors = null) => {
    const response = {
        success: false,
        message,
        timestamp: new Date().toISOString()
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
    console.error('Error:', err);

    if (err.code === 'validation') {
        return sendErrorResponse(res, 400, 'Validation failed', err.issues);
    }
    if (err.code === 'duplicate') return sendErrorResponse(res, 409, `${err.field} already exists`);
    if (err.code === 'invalid-id') return sendErrorResponse(res, 400, 'Invalid ID format');

    // Default error
    return sendErrorResponse(res, 500, 'Internal server error');
};

module.exports = {
    sendErrorResponse,
    asyncHandler,
    errorHandler
};