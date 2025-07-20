const {
    azureFunctionWrapper,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const dbConfig = require('../shared/config/db.config');
const HotDealsService = require('../shared/services/hotDealService');
async function getAllHotDealsHandler(context, req) {
    await ensureDbConnection(dbConfig, context);
    
    const result = await HotDealsService.getAllCategories();
    
    return {
        message: 'All hot deals categories retrieved successfully',
        data: result
    };
}

module.exports = azureFunctionWrapper(getAllHotDealsHandler, {
    requireAuth: false,
    validateInput: null,
    enableCors: true,
    timeout: 10000
});
