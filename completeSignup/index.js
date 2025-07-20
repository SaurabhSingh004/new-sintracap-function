// completeSignup/index.js
const { 
    azureFunctionWrapper, 
    validateEmail, 
    validateRequired,
    ValidationError,
    ensureDbConnection 
} = require('../shared/middleware/errorHandler');
const AuthService = require('../shared/services/authService');
const dbConfig = require('../shared/config/db.config');

// Main function handler
async function completeSignupHandler(context, req) {
    // Ensure database connection
    await ensureDbConnection(dbConfig, context);
    
    // Extract and validate basic parameters
    const { email, role } = req.body;
    const validatedEmail = validateEmail(email);
    const validatedRole = validateRequired(role, 'role');
    
    // Validate role is correct
    if (!['investor', 'founder'].includes(validatedRole)) {
        throw new ValidationError('Role must be either "investor" or "founder"');
    }
    
    // Check if pre-signup exists
    const preSignupExists = await AuthService.preSignupExists(validatedEmail);
    if (!preSignupExists) {
        throw new ValidationError('Pre-signup not completed. Please complete the pre-signup process first.');
    }
    
    let result;
    
    if (validatedRole === 'investor') {
        // Validate investor-specific requirements
        const { interests } = req.body;
        if (!interests || !Array.isArray(interests) || interests.length === 0) {
            throw new ValidationError('Interests are required for investor role');
        }
        
        result = await AuthService.createInvestorProfile(validatedEmail, req.body);
    } else if (validatedRole === 'founder') {
        // Validate founder-specific requirements
        const { startupDescription } = req.body;
        if (!startupDescription || startupDescription.trim() === '') {
            throw new ValidationError('Startup description is required for founder role');
        }
        
        result = await AuthService.createFounderProfile(validatedEmail, req.body);
    }
    
    return {
        message: `${validatedRole.charAt(0).toUpperCase() + validatedRole.slice(1)} profile completed successfully`,
        data: result
    };
}

// Input validation function
function validateCompleteSignupInput(req) {
    if (!req.body) {
        throw new ValidationError('Request body is required');
    }
    
    const { email, role, interests, startupDescription } = req.body;
    
    // Check required fields
    if (!email) {
        throw new ValidationError('Email is required');
    }
    
    if (!role) {
        throw new ValidationError('Role is required');
    }
    
    // Role-specific validation
    if (role === 'investor') {
        if (!interests) {
            throw new ValidationError('Interests are required for investor role');
        }
        if (!Array.isArray(interests)) {
            throw new ValidationError('Interests must be an array');
        }
        if (interests.length === 0) {
            throw new ValidationError('At least one interest must be provided');
        }
    } else if (role === 'founder') {
        if (!startupDescription) {
            throw new ValidationError('Startup description is required for founder role');
        }
        if (typeof startupDescription !== 'string' || startupDescription.trim() === '') {
            throw new ValidationError('Startup description must be a non-empty string');
        }
    } else if (role !== 'investor' && role !== 'founder') {
        throw new ValidationError('Role must be either "investor" or "founder"');
    }
}

// Export wrapped function
module.exports = azureFunctionWrapper(completeSignupHandler, {
    requireAuth: false,
    validateInput: validateCompleteSignupInput,
    enableCors: true,
    timeout: 20000 // 20 seconds for profile creation
});