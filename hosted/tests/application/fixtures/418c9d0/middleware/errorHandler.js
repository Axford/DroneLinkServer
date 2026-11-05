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

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        const errors = Object.values(err.errors).map(e => ({
            field: e.path,
            message: e.message
        }));
        return sendErrorResponse(res, 400, 'Validation failed', errors);
    }

    // Mongoose duplicate key error
    if (err.code === 11000) {
        const field = Object.keys(err.keyValue)[0];
        return sendErrorResponse(res, 409, `${field} already exists`);
    }

    // Mongoose cast error
    if (err.name === 'CastError') {
        return sendErrorResponse(res, 400, 'Invalid ID format');
    }

    // Default error
    return sendErrorResponse(res, 500, 'Internal server error');
};

module.exports = {
    sendErrorResponse,
    asyncHandler,
    errorHandler
};