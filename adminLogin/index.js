// adminLogin/index.js
const { 
    azureFunctionWrapper, 
    validateEmail, 
    validateRequired,
    ensureDbConnection 
} = require('../shared/middleware/errorHandler');
const AuthService = require('../shared/services/authService');
const dbConfig = require('../shared/config/db.config');

// Main function handler
async function adminLoginHandler(context, req) {
    // Ensure database connection
    await ensureDbConnection(dbConfig, context);
    
    // Extract and validate credentials
    const { email, password } = req.body;
    const validatedEmail = validateEmail(email);
    const validatedPassword = validateRequired(password, 'password');
    
    // Perform admin login
    const result = await AuthService.adminLogin(validatedEmail, validatedPassword);
    
    return {
        message: 'Admin login successful',
        data: result
    };
}

// Input validation function
function validateAdminLoginInput(req) {
    if (!req.body) {
        throw new ValidationError('Request body is required');
    }
    
    const { email, password } = req.body;
    if (!email || !password) {
        throw new ValidationError('Email and password are required');
    }
}

// Export wrapped function
module.exports = azureFunctionWrapper(adminLoginHandler, {
    requireAuth: false,
    validateInput: validateAdminLoginInput,
    enableCors: true,
    timeout: 15000
});