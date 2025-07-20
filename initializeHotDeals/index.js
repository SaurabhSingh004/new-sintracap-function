const {
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const authenticateToken = require('../shared/middleware/authenticateToken');
const dbConfig = require('../shared/config/db.config');
const HotDealsService = require('../shared/services/hotDealService');

async function initializeHotDealsCategoriesHandler(context, req) {
    await ensureDbConnection(dbConfig, context);

    const authenticatedUser = await authenticateToken(context, req);

    if (!authenticatedUser || authenticatedUser.role !== 'admin') {
        throw new ValidationError('Only admins can initialize hot deals categories');
    }
    
    const result = await HotDealsService.initializeCategories(authenticatedUser._id);
    
    return result;
}

module.exports = azureFunctionWrapper(initializeHotDealsCategoriesHandler, {
    requireAuth: true,
    validateInput: null,
    enableCors: true,
    timeout: 15000
});