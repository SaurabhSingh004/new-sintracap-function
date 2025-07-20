// sendMailVerification/index.js
const { 
    azureFunctionWrapper, 
    validateEmail,
    ValidationError,
    NotFoundError,
    ensureDbConnection 
} = require('../shared/middleware/errorHandler');
const AuthService = require('../shared/services/authService');
const dbConfig = require('../shared/config/db.config');
const sintracapFounder = require('../models/sintracapFounder');
const sintracapInvestor = require('../models/sintracapInvestor');

// Main function handler
async function sendMailVerificationHandler(context, req) {
    // Ensure database connection
    await ensureDbConnection(dbConfig, context);
    
    // Extract and validate email
    const { email } = req.body;
    const validatedEmail = validateEmail(email);
    
    // Find user in both collections
    let user = await sintracapInvestor.findOne({ email: validatedEmail });
    if (!user) {
        user = await sintracapFounder.findOne({ email: validatedEmail });
    }
    
    if (!user) {
        throw new NotFoundError('User not found');
    }
    
    // Check if already verified
    if (user.emailVerified) {
        throw new ValidationError('Email already verified');
    }
    
    // Generate and send verification email
    const verificationToken = AuthService.generateVerificationToken();
    
    // Update user with verification token
    user.emailVerificationToken = verificationToken;
    user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    await user.save();
    
    // Send verification email
    await AuthService.sendVerificationEmail(validatedEmail, verificationToken);
    
    return {
        message: 'Verification email sent successfully'
    };
}

// Input validation function
function validateSendMailVerificationInput(req) {
    if (!req.body) {
        throw new ValidationError('Request body is required');
    }
    
    const { email } = req.body;
    if (!email) {
        throw new ValidationError('Email is required');
    }
}

// Export wrapped function
module.exports = azureFunctionWrapper(sendMailVerificationHandler, {
    requireAuth: false,
    validateInput: validateSendMailVerificationInput,
    enableCors: true,
    timeout: 20000
});