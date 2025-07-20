const {
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const authenticateToken = require('../shared/middleware/authenticateToken');
const dbConfig = require('../shared/config/db.config');
const HotDealsService = require('../shared/services/hotDealService');

async function getHotDealsByCategoryHandler(context, req) {
    await ensureDbConnection(dbConfig, context);
    
    const authenticatedUser = await authenticateToken(context, req);
    if (!authenticatedUser) {
        return;
    }
    
    const category = context.bindingData.category;
    
    if (!category) {
        throw new ValidationError('Category is required');
    }
    
    const result = await HotDealsService.getCategoryDeals(category);
    
    return {
        message: 'Hot deals retrieved successfully',
        data: result
    };
}

module.exports = azureFunctionWrapper(getHotDealsByCategoryHandler, {
    requireAuth: false,
    validateInput: null,
    enableCors: true,
    timeout: 10000
});