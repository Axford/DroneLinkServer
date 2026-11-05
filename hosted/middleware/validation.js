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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const sort = req.query.sort || 'createdAt';
    const order = req.query.order === 'asc' ? 1 : -1;

    if (page < 1) {
        return res.status(400).json({
            success: false,
            message: 'Page must be greater than 0'
        });
    }

    if (limit < 1 || limit > 100) {
        return res.status(400).json({
            success: false,
            message: 'Limit must be between 1 and 100'
        });
    }

    req.pagination = {
        page,
        limit,
        skip: (page - 1) * limit,
        sort: { [sort]: order }
    };

    next();
};

module.exports = {
    validateDomainCreate: validate(domainCreateSchema),
    validateDomainUpdate: validate(domainUpdateSchema),
    validatePagination
};