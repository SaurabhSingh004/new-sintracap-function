const {
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const authenticateToken = require('../shared/middleware/authenticateToken');
const dbConfig = require('../shared/config/db.config');
const OnboardingService = require('../shared/services/onboardingService');
async function getFounderProgressHandler(context, req) {
    await ensureDbConnection(dbConfig, context);

    const authenticatedUser = await authenticateToken(context, req);

    if (!authenticatedUser) {
        throw new ValidationError('Authentication required');
    }
    
    const result = await OnboardingService.getFounderProgress(authenticatedUser._id);
    
    return result;
}

module.exports = azureFunctionWrapper(getFounderProgressHandler, {
    requireAuth: true,
    validateInput: null,
    enableCors: true,
    timeout: 15000
});