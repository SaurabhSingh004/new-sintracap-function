const {
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const authenticateToken = require('../shared/middleware/authenticateToken');
const dbConfig = require('../shared/config/db.config');
const OnboardingService = require('../shared/services/onboardingService');

async function removeQuestionHandler(context, req) {
    await ensureDbConnection(dbConfig, context);

    const authenticatedUser = await authenticateToken(context, req);

    if (!authenticatedUser || authenticatedUser.role !== 'admin') {
        throw new ValidationError('Only admins can remove questions');
    }

    const { questionId } = req.params;

    if (!questionId) {
        throw new ValidationError('Question ID is required');
    }
    
    const result = await OnboardingService.removeQuestionFromCategory(questionId, authenticatedUser._id);
    
    return result;
}

module.exports = azureFunctionWrapper(removeQuestionHandler, {
    requireAuth: true,
    validateInput: null,
    enableCors: true,
    timeout: 15000
});