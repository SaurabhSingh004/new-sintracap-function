const {
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const authenticateToken = require('../shared/middleware/authenticateToken');
const dbConfig = require('../shared/config/db.config');
const OnboardingService = require('../shared/services/onboardingService');

async function getCurrentStepQuestionsHandler(context, req) {
    await ensureDbConnection(dbConfig, context);

    const authenticatedUser = await authenticateToken(context, req);

    if (!authenticatedUser) {
        throw new ValidationError('Authentication required');
    }

    const { step } = req.params;

    if (!step) {
        throw new ValidationError('Step is required');
    }

    const stepNumber = parseInt(step);
    if (isNaN(stepNumber) || stepNumber < 1) {
        throw new ValidationError('Invalid step number');
    }
    
    const result = await OnboardingService.getCurrentStepQuestion(authenticatedUser._id, stepNumber);
    
    return result;
}

module.exports = azureFunctionWrapper(getCurrentStepQuestionsHandler, {
    requireAuth: true,
    validateInput: null,
    enableCors: true,
    timeout: 15000
});