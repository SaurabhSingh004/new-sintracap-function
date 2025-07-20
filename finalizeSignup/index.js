// finalizeSignup/index.js
const { 
    azureFunctionWrapper, 
    validateEmail,
    ensureDbConnection 
} = require('../shared/middleware/errorHandler');
const AuthService = require('../shared/services/authService');
const dbConfig = require('../shared/config/db.config');

// Main function handler
async function finalizeSignupHandler(context, req) {
    // Ensure database connection
    await ensureDbConnection(dbConfig, context);
    
    // Extract and validate email
    const { email } = req.body;
    const validatedEmail = validateEmail(email);
    
    // Finalize signup
    const result = await AuthService.finalizeSignup(validatedEmail);
    
    return result;
}

// Input validation function
function validateFinalizeSignupInput(req) {
    if (!req.body) {
        throw new ValidationError('Request body is required');
    }
    
    const { email } = req.body;
    if (!email) {
        throw new ValidationError('Email is required');
    }
}

// Export wrapped function
module.exports = azureFunctionWrapper(finalizeSignupHandler, {
    requireAuth: false,
    validateInput: validateFinalizeSignupInput,
    enableCors: true,
    timeout: 15000
});