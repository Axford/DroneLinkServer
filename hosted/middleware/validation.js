const Joi = require('joi');

// Domain validation schemas
const domainCreateSchema = Joi.object({
    name: Joi.string().trim().min(1).max(100).required()
});

const domainUpdateSchema = Joi.object({
    name: Joi.string().trim().min(1).max(100).required()
});

// Validation middleware factory
const validate = (schema) => {
    return (req, res, next) => {
        const { error, value } = schema.validate(req.body, {
            abortEarly: false,
            stripUnknown: true
        });

        if (error) {
            const errors = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message
            }));
            
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors
            });
        }

        req.body = value;
        next();
    };
};

// Query parameter validation
const validatePagination = (req, res, next) => {
    const limit = req.query.limit === undefined ? 10 : Number(req.query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || ['page', 'sort', 'order', 'search', 'status'].some(key => req.query[key] !== undefined)) {
        return res.status(400).json({ success: false, message: 'Use a cursor and limit between 1 and 100' });
    }
    req.pagination = { limit, ...(req.query.cursor ? { cursor: req.query.cursor } : {}) };

    next();
};

module.exports = {
    validateDomainCreate: validate(domainCreateSchema),
    validateDomainUpdate: validate(domainUpdateSchema),
    validatePagination
};