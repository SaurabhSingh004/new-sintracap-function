const {
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const authenticateToken = require('../shared/middleware/authenticateToken');
const dbConfig = require('../shared/config/db.config');
const OnboardingService = require('../shared/services/onboardingService');

async function getAllActiveQuestionsHandler(context, req) {
    await ensureDbConnection(dbConfig, context);

    const authenticatedUser = await authenticateToken(context, req);

    if (!authenticatedUser || authenticatedUser.role !== 'admin') {
        throw new ValidationError('Only admins can view all questions');
    }
    
    const result = await OnboardingService.getAllActiveQuestions();
    
    return result;
}

module.exports = azureFunctionWrapper(getAllActiveQuestionsHandler, {
    requireAuth: true,
    validateInput: null,
    enableCors: true,
    timeout: 15000
});