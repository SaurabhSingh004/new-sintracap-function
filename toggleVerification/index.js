// toggleVerification/index.js
const { 
    azureFunctionWrapper,
    validateRequired,
    ValidationError,
    ensureDbConnection 
} = require('../shared/middleware/errorHandler');
const AuthService = require('../shared/services/authService');
const dbConfig = require('../shared/config/db.config');
const mongoose = require('mongoose');

// Main function handler
async function toggleVerificationHandler(context, req) {
    // Ensure database connection
    await ensureDbConnection(dbConfig, context);
    
    // Get user ID from route parameter
    const userId = context.bindingData.id;
    const validatedUserId = validateRequired(userId, 'userId');
    
    // Validate userId format
    if (!mongoose.Types.ObjectId.isValid(validatedUserId)) {
        throw new ValidationError('Invalid user ID format');
    }
    
    // Extract and validate request body
    const { role, isVerifiedByAdmin } = req.body;
    const validatedRole = validateRequired(role, 'role');
    
    // Validate role
    if (!['investor', 'founder'].includes(validatedRole)) {
        throw new ValidationError('Role must be either "investor" or "founder"');
    }
    
    // Validate verification status
    if (typeof isVerifiedByAdmin !== 'boolean') {
        throw new ValidationError('isVerifiedByAdmin must be a boolean value');
    }
    
    // Toggle verification status
    const result = await AuthService.toggleVerificationStatus(
        validatedUserId, 
        validatedRole, 
        isVerifiedByAdmin
    );
    
    return {
        message: `User verification status ${result.isVerified ? 'approved' : 'revoked'}`,
        data: result
    };
}

// Input validation function
function validateToggleVerificationInput(req) {
    if (!req.body) {
        throw new ValidationError('Request body is required');
    }
    
    const { role, isVerifiedByAdmin } = req.body;
    
    if (!role) {
        throw new ValidationError('Role is required');
    }
    
    if (typeof isVerifiedByAdmin !== 'boolean') {
        throw new ValidationError('isVerifiedByAdmin must be a boolean value');
    }
    
    // Validate role
    if (!['investor', 'founder'].includes(role)) {
        throw new ValidationError('Role must be either "investor" or "founder"');
    }
}

// Export wrapped function
module.exports = azureFunctionWrapper(toggleVerificationHandler, {
    requireAuth: false, // Set to true if admin authentication is required
    validateInput: validateToggleVerificationInput,
    enableCors: true,
    timeout: 15000
});