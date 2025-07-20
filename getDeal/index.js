const {
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const dbConfig = require('../shared/config/db.config');
const DealsService = require('../shared/services/dealService');

async function getDealHandler(context, req) {
    await ensureDbConnection(dbConfig, context);
    
    const dealId = context.bindingData.dealId;
    
    if (!dealId) {
        throw new ValidationError('Deal ID is required');
    }
    
    const deal = await DealsService.getDealById(dealId);
    
    return {
        message: 'Deal retrieved successfully',
        data: deal
    };
}

module.exports = azureFunctionWrapper(getDealHandler, {
    requireAuth: false,
    validateInput: null,
    enableCors: true,
    timeout: 10000
});
