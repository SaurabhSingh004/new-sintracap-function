const {
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const authenticateToken = require('../shared/middleware/authenticateToken');
const dbConfig = require('../shared/config/db.config');
const HotDealsService = require('../shared/services/hotDealService');

async function removeDealFromHotDealsHandler(context, req) {
    await ensureDbConnection(dbConfig, context);
    
    const authenticatedUser = await authenticateToken(context, req);
    if (!authenticatedUser || authenticatedUser.role !== 'admin') {
        throw new ValidationError('Only admins can remove deals from hot deals');
    }
    
    const category = context.bindingData.category;
    const dealId = context.bindingData.dealId;
    
    if (!category) {
        throw new ValidationError('Category is required');
    }
    
    if (!dealId) {
        throw new ValidationError('Deal ID is required');
    }
    
    const result = await HotDealsService.removeDealFromCategory(category, dealId, user._id);
    
    return {
        message: 'Deal removed from hot deals successfully',
        data: result
    };
}

module.exports = azureFunctionWrapper(removeDealFromHotDealsHandler, {
    requireAuth: true,
    validateInput: null,
    enableCors: true,
    timeout: 15000
}); 