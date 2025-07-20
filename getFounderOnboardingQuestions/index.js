const {
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const authenticateToken = require('../shared/middleware/authenticateToken');
const dbConfig = require('../shared/config/db.config');
const OnboardingService = require('../shared/services/onboardingService');

async function getFounderOnboardingQuestionsHandler(context, req) {
    await ensureDbConnection(dbConfig, context);

    const authenticatedUser = await authenticateToken(context, req);

    if (!authenticatedUser) {
        throw new ValidationError('Authentication required');
    }

    const { founderCategory } = req.params;

    if (!founderCategory) {
        throw new ValidationError('Founder category is required');
    }

    const validCategories = ['public-equities', 'private-equity', 'real-assets', 'private-credit'];
    if (!validCategories.includes(founderCategory)) {
        throw new ValidationError('Invalid founder category');
    }
    
    const result = await OnboardingService.getFounderOnboardingQuestions(founderCategory);
    
    return result;
}

module.exports = azureFunctionWrapper(getFounderOnboardingQuestionsHandler, {
    requireAuth: true,
    validateInput: null,
    enableCors: true,
    timeout: 15000
});