const {
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const authenticateToken = require('../shared/middleware/authenticateToken');
const dbConfig = require('../shared/config/db.config');
const OnboardingService = require('../shared/services/onboardingService');
async function updateQuestionHandler(context, req) {
    await ensureDbConnection(dbConfig, context);

    const authenticatedUser = await authenticateToken(context, req);

    if (!authenticatedUser || authenticatedUser.role !== 'admin') {
        throw new ValidationError('Only admins can update questions');
    }

    const { questionId } = req.params;
    const updateData = req.body;

    if (!questionId) {
        throw new ValidationError('Question ID is required');
    }
    
    const result = await OnboardingService.updateQuestion(questionId, updateData, authenticatedUser._id);
    
    return result;
}

module.exports = azureFunctionWrapper(updateQuestionHandler, {
    requireAuth: true,
    validateInput: {
        body: {
            question: { type: 'string', required: false },
            questionType: { type: 'string', required: false },
            options: { type: 'array', required: false },
            validation: { type: 'object', required: false },
            order: { type: 'number', required: false },
            helpText: { type: 'string', required: false },
            placeholder: { type: 'string', required: false },
            isActive: { type: 'boolean', required: false },
            subcategory: { type: 'string', required: false }
        }
    },
    enableCors: true,
    timeout: 15000
});