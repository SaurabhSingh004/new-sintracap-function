// shared/middleware/errorHandler.js

// Simple Custom Errors
class AppError extends Error {
    constructor(message, statusCode = 500) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
    }
}

class ValidationError extends AppError {
    constructor(message) {
        super(message, 400);
    }
}

class DatabaseError extends AppError {
    constructor(message = 'Database error') {
        super(message, 503);
    }
}

class AuthError extends AppError {
    constructor(message = 'Authentication failed') {
        super(message, 401);
    }
}

// Simple Response Helper
const createResponse = (success, data, message = null, statusCode = 200) => {
    return {
        success,
        statusCode,
        message,
        data,
        timestamp: new Date().toISOString()
    };
};

// Simple Validator
const validateEmail = (email) => {
    if (!email || typeof email !== 'string') {
        throw new ValidationError('Valid email is required');
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
        throw new ValidationError('Invalid email format');
    }
    
    return email.trim().toLowerCase();
};

const validateRequired = (value, fieldName) => {
    if (!value) {
        throw new ValidationError(`${fieldName} is required`);
    }
    return value;
};

// Simple Database Connection Handler
let dbConnection = null;

const ensureDbConnection = async (dbConfig, context) => {
    if (!dbConnection) {
        try {
            context.log('Establishing database connection...');
            dbConnection = await dbConfig();
            context.log('Database connected successfully');
        } catch (error) {
            context.log.error('Database connection failed:', error.message);
            throw new DatabaseError('Failed to connect to database');
        }
    }
    return dbConnection;
};

// Helper function to parse request body
const parseRequestBody = (req, context) => {
    // Check if body is already parsed
    if (req.body && typeof req.body === 'object') {
        return req.body;
    }

    // Check if body exists but is string
    if (req.body && typeof req.body === 'string') {
        try {
            return JSON.parse(req.body);
        } catch (error) {
            context.log.error('Failed to parse JSON body:', error.message);
            throw new ValidationError('Invalid JSON in request body');
        }
    }

    // Check if rawBody exists (Azure Functions sometimes uses this)
    if (req.rawBody) {
        try {
            const bodyString = req.rawBody.toString();
            return JSON.parse(bodyString);
        } catch (error) {
            context.log.error('Failed to parse JSON from rawBody:', error.message);
            throw new ValidationError('Invalid JSON in request body');
        }
    }

    // If no body found
    throw new ValidationError('Request body is required');
};

// Main Function Wrapper
const azureFunctionWrapper = (handler, options = {}) => {
    const { 
        requireAuth = false, 
        enableCors = true, 
        validateInput = null,
        timeout = 30000 
    } = options;

    return async (context, req) => {
        try {
            // Set CORS headers
            if (enableCors) {
                context.res = {
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
                    }
                };
            }

            // Handle OPTIONS request
            if (req.method === 'OPTIONS') {
                context.res.status = 204;
                return;
            }

            // Run custom input validation if provided
            if (validateInput && typeof validateInput === 'function') {
                validateInput(req);
            }

            // Basic auth check (if required)
            if (requireAuth) {
                const authHeader = req.headers.authorization;
                if (!authHeader) {
                    throw new AuthError('Authorization header required');
                }
                // Add your token validation logic here
                // req.user = await validateToken(authHeader);
            }

            // Execute main handler
            const result = await handler(context, req);
            
            // Set success response if not already set
            if (!context.res.body) {
                context.res.status = 200;
                context.res.body = createResponse(true, result, 'Success');
            }

        } catch (error) {
            // Log error details
            context.log.error('Function error:', {
                message: error.message,
                stack: error.stack,
                statusCode: error.statusCode,
                method: req.method,
                url: req.url,
                headers: req.headers,
                hasBody: !!req.body,
                bodyType: typeof req.body
            });

            // Set error response
            const statusCode = error.statusCode || 500;
            const message = error.isOperational ? error.message : 'Internal server error';
            
            context.res.status = statusCode;
            context.res.body = createResponse(false, null, message, statusCode);
        }
    };
};

module.exports = {
    // Errors
    AppError,
    ValidationError,
    DatabaseError,
    AuthError,
    
    // Helpers
    createResponse,
    validateEmail,
    validateRequired,
    ensureDbConnection,
    parseRequestBody,
    
    // Main wrapper
    azureFunctionWrapper
};