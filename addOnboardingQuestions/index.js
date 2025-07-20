const {
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const authenticateToken = require('../shared/middleware/authenticateToken');
const dbConfig = require('../shared/config/db.config');
const OnboardingService = require('../shared/services/onboardingService');

// ===== 1. Add Question to Category =====
async function addQuestionToCategoryHandler(context, req) {
    await ensureDbConnection(dbConfig, context);

    const authenticatedUser = await authenticateToken(context, req);

    if (!authenticatedUser || authenticatedUser.role !== 'admin') {
        throw new ValidationError('Only admins can add questions');
    }

    const { category } = req.params;
    const questionData = req.body;

    if (!category) {
        throw new ValidationError('Category is required');
    }

    const validCategories = ['universal', 'public-equities', 'private-equity', 'real-assets', 'private-credit'];
    if (!validCategories.includes(category)) {
        throw new ValidationError('Invalid category');
    }

    // Validate question data
    OnboardingService.validateQuestionData(questionData);
    
    const result = await OnboardingService.addQuestionToCategory(category, questionData, authenticatedUser._id);
    
    return result;
}

module.exports = azureFunctionWrapper(addQuestionToCategoryHandler, {
    requireAuth: true,
    validateInput: {
        body: {
            question: { type: 'string', required: true },
            questionType: { type: 'string', required: true },
            options: { type: 'array', required: false },
            validation: { type: 'object', required: false },
            order: { type: 'number', required: false },
            helpText: { type: 'string', required: false },
            placeholder: { type: 'string', required: false },
            subcategory: { type: 'string', required: false }
        }
    },
    enableCors: true,
    timeout: 15000
});