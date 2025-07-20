// checkEmail/index.js
const dbConfig = require('../shared/config/db.config');
const AuthService = require('../shared/services/authService');
const { 
    azureFunctionWrapper, 
    validateEmail,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');

// Main function handler
async function checkEmailHandler(context, req) {
    // Ensure database connection
    await ensureDbConnection(dbConfig, context);
    
    // Validate email
    const { email } = req.body;
    const validatedEmail = validateEmail(email);
    
    // Check email availability
    const available = await AuthService.isEmailAvailable(validatedEmail);
    
    return { available, email: validatedEmail };
}

// Export wrapped function
module.exports = azureFunctionWrapper(checkEmailHandler);