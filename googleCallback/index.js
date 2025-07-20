// googleCallback/index.js
const { 
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection 
} = require('../shared/middleware/errorHandler');
const AuthService = require('../shared/services/authService');
const dbConfig = require('../shared/config/db.config');

// Main function handler
async function googleCallbackHandler(context, req) {
    // Ensure database connection
    await ensureDbConnection(dbConfig, context);
    
    // Process the Google OAuth callback data
    const result = await AuthService.handleGoogleCallback(req.body);
    
    // Customize message if account was reactivated
    const message = result.user.wasReactivated
        ? 'Google SignIn Successful. Your account has been reactivated.'
        : 'Google SignIn Successful';
    
    // Remove the wasReactivated flag from the response to the client
    delete result.user.wasReactivated;
    
    return {
        message: message,
        data: result
    };
}

// Input validation function
function validateGoogleCallbackInput(req) {
    if (!req.body) {
        throw new ValidationError('Request body is required');
    }
    
    // Basic validation - AuthService will handle detailed validation
    const { email } = req.body;
    if (!email) {
        throw new ValidationError('Email is required in Google callback data');
    }
}

// Export wrapped function
module.exports = azureFunctionWrapper(googleCallbackHandler, {
    requireAuth: false,
    validateInput: validateGoogleCallbackInput,
    enableCors: true,
    timeout: 20000
});