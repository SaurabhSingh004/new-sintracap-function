// preSignup/index.js
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
async function preSignupHandler(context, req) {
    // Ensure database connection
    await ensureDbConnection(dbConfig, context);
    console.log('Pre-signup request received:', req.body);
    // Extract and validate input
    const { email, password, name, phone, agreedToTerms, role, authMethod, category, subcategory } = req.body;
    
    const validatedEmail = validateEmail(email);
    const validatedName = validateRequired(name, 'name');
    const validatedPhone = validateRequired(phone, 'phone');
    const validatedRole = validateRequired(role, 'role');

    // Validate role is correct
    if (!['investor', 'founder'].includes(validatedRole)) {
        throw new ValidationError('Role must be either "investor" or "founder"');
    }

    // Validate terms agreement
    if (agreedToTerms !== true) {
        throw new ValidationError('You must agree to the terms and conditions');
    }

    // Check if email is available
    const emailAvailable = await AuthService.isEmailAvailable(validatedEmail);
    const isLinkedInUser = await AuthService.isLinkedInUser(validatedEmail);

    if (
        !emailAvailable &&
        !isLinkedInUser &&
        authMethod !== "google"
    ) {
        throw new ValidationError('Email is already registered');
    }
    // Create pre-signup user
    await AuthService.createPreSignupUser({
        email: validatedEmail,
        password,
        name: validatedName,
        phone: validatedPhone,
        agreedToTerms,
        role: validatedRole,
        isLinkedInUser,
        authMethod,
        category: role === 'founder' ? category : null,
        subcategory: role === 'founder' ? subcategory : null,
    });

    return {
        status: 'success',
        emailVerified: false,
        message: 'Pre-signup process completed successfully. Please proceed to the next step.'
    };
}

// Input validation function
function validatePreSignupInput(req) {
    if (!req.body) {
        throw new ValidationError('Request body is required');
    }

    const { email, name, phone, agreedToTerms, role } = req.body;

    // Check required fields
    if (!email) {
        throw new ValidationError('Email is required');
    }

    if (!name) {
        throw new ValidationError('Name is required');
    }

    if (!phone) {
        throw new ValidationError('Phone is required');
    }

    if (!role) {
        throw new ValidationError('Role is required');
    }

    if (!agreedToTerms) {
        throw new ValidationError('You must agree to the terms and conditions');
    }

    // Validate role
    if (!['investor', 'founder'].includes(role)) {
        throw new ValidationError('Role must be either "investor" or "founder"');
    }

    // Validate phone format (basic)
    if (typeof phone !== 'string' || phone.trim().length < 10) {
        throw new ValidationError('Please provide a valid phone number');
    }

    // Validate name length
    if (typeof name !== 'string' || name.trim().length < 2) {
        throw new ValidationError('Name must be at least 2 characters long');
    }
}

// Export wrapped function
module.exports = azureFunctionWrapper(preSignupHandler, {
    requireAuth: false,
    validateInput: validatePreSignupInput,
    enableCors: true,
    timeout: 20000
});