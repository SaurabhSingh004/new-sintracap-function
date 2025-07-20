// verifyEmail/index.js
const { 
    azureFunctionWrapper, 
    validateEmail,
    validateRequired,
    ValidationError,
    NotFoundError,
    ensureDbConnection 
} = require('../shared/middleware/errorHandler');
const dbConfig = require('../shared/config/db.config');
const sintracapFounder = require('../models/sintracapFounder');
const sintracapInvestor = require('../models/sintracapInvestor');

// Main function handler
async function verifyEmailHandler(context, req) {
    // Ensure database connection
    await ensureDbConnection(dbConfig, context);
    
    // Extract and validate input
    const { token, email } = req.body;
    const validatedToken = validateRequired(token, 'token');
    const validatedEmail = validateEmail(email);
    
    // Find user with matching email and token
    let user = await sintracapInvestor.findOne({
        email: validatedEmail,
        emailVerificationToken: validatedToken
    });
    
    if (!user) {
        user = await sintracapFounder.findOne({
            email: validatedEmail,
            emailVerificationToken: validatedToken
        });
    }
    
    if (!user) {
        throw new ValidationError('Invalid or expired verification token');
    }
    
    // Check if token is expired
    if (user.emailVerificationExpires && user.emailVerificationExpires < Date.now()) {
        throw new ValidationError('Verification token has expired');
    }
    
    // Mark email as verified
    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    
    await user.save();
    
    return {
        message: 'Email verified successfully',
        email: user.email,
        verified: true
    };
}

// Input validation function
function validateVerifyEmailInput(req) {
    if (!req.body) {
        throw new ValidationError('Request body is required');
    }
    
    const { token, email } = req.body;
    
    if (!token) {
        throw new ValidationError('Verification token is required');
    }
    
    if (!email) {
        throw new ValidationError('Email is required');
    }
    
    // Validate token format (basic check)
    if (typeof token !== 'string' || token.trim().length < 4) {
        throw new ValidationError('Invalid token format');
    }
}

// Export wrapped function
module.exports = azureFunctionWrapper(verifyEmailHandler, {
    requireAuth: false,
    validateInput: validateVerifyEmailInput,
    enableCors: true,
    timeout: 15000
});