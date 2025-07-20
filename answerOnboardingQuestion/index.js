const {
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const authenticateToken = require('../shared/middleware/authenticateToken');
const dbConfig = require('../shared/config/db.config');
const OnboardingService = require('../shared/services/onboardingService');

async function answerQuestionHandler(context, req) {
    await ensureDbConnection(dbConfig, context);

    const authenticatedUser = await authenticateToken(context, req);

    if (!authenticatedUser) {
        throw new ValidationError('Authentication required');
    }

    const { questionId, answer, skipped = false } = req.body;

    if (!questionId) {
        throw new ValidationError('Question ID is required');
    }

    if (!skipped && (answer === undefined || answer === null)) {
        throw new ValidationError('Answer is required when not skipping');
    }
    
    const result = await OnboardingService.answerQuestion(authenticatedUser._id, questionId, answer, skipped);
    
    return result;
}

module.exports = azureFunctionWrapper(answerQuestionHandler, {
    requireAuth: true,
    validateInput: {
        body: {
            questionId: { type: 'string', required: true },
            answer: { required: false },
            skipped: { type: 'boolean', required: false }
        }
    },
    enableCors: true,
    timeout: 15000
});