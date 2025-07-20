// login/index.js
const { 
    azureFunctionWrapper, 
    validateEmail, 
    validateRequired,
    ensureDbConnection,
    ValidationError
} = require('../shared/middleware/errorHandler');
const AuthService = require('../shared/services/authService');
const dbConfig = require('../shared/config/db.config');

// Main function handler
async function loginHandler(context, req) {
    // Ensure database connection
    await ensureDbConnection(dbConfig, context);
    
    // Log request details for debugging
    context.log('Login request received:', {
        method: req.method,
        hasBody: !!req.body,
        bodyType: typeof req.body,
        contentType: req.headers['content-type']
    });
    
    // Extract and validate credentials
    const { email, password } = req.body;
    const validatedEmail = validateEmail(email);
    const validatedPassword = validateRequired(password, 'password');
    
    context.log('Login attempt for email:', validatedEmail);
    
    // Perform login
    const result = await AuthService.login(validatedEmail, validatedPassword);
    
    context.log('Login successful for:', validatedEmail);
    return result;
}

// Input validation function
function validateLoginInput(req) {
    // Check if request body exists
    if (!req.body) {
        throw new ValidationError('Request body is required. Make sure to include Content-Type: application/json header');
    }
    
    // Check if body is an object
    if (typeof req.body !== 'object') {
        throw new ValidationError('Request body must be valid JSON');
    }
    
    const { email, password } = req.body;
    
    // Check required fields
    if (!email) {
        throw new ValidationError('Email is required');
    }
    
    if (!password) {
        throw new ValidationError('Password is required');
    }
    
    // Basic email format check
    if (typeof email !== 'string' || !email.trim()) {
        throw new ValidationError('Valid email is required');
    }
    
    if (typeof password !== 'string' || !password.trim()) {
        throw new ValidationError('Valid password is required');
    }
}

// Export wrapped function
module.exports = azureFunctionWrapper(loginHandler, {
    requireAuth: false,
    validateInput: validateLoginInput,
    enableCors: true,
    timeout: 15000
});