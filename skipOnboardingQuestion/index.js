const {
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const authenticateToken = require('../shared/middleware/authenticateToken');
const dbConfig = require('../shared/config/db.config');
const OnboardingService = require('../shared/services/onboardingService');

async function skipQuestionHandler(context, req) {
    await ensureDbConnection(dbConfig, context);

    const authenticatedUser = await authenticateToken(context, req);

    if (!authenticatedUser) {
        throw new ValidationError('Authentication required');
    }

    const { questionId } = req.params;

    if (!questionId) {
        throw new ValidationError('Question ID is required');
    }
    
    const result = await OnboardingService.answerQuestion(
        authenticatedUser._id, 
        questionId, 
        null, 
        true
    );
    
    return result;
}

module.exports = azureFunctionWrapper(skipQuestionHandler, {
    requireAuth: true,
    validateInput: null,
    enableCors: true,
    timeout: 15000
});