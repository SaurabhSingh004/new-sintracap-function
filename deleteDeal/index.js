const {
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const dbConfig = require('../shared/config/db.config');
const DealsService = require('../shared/services/dealService');
const authenticateToken = require('../shared/middleware/authenticateToken')
async function deleteDealHandler(context, req) {
    await ensureDbConnection(dbConfig, context);
    
    const user = await authenticateToken(context, req);
    if (!user) {
        return; // Response already set by authenticateToken middleware
    }

    if (!user || user.role !== 'admin') {
        throw new ValidationError('Only admins can delete deals');
    }
    
    const dealId = context.bindingData.dealId;
    
    if (!dealId) {
        throw new ValidationError('Deal ID is required');
    }
    
    const result = await DealsService.deleteDeal(dealId, user._id);
    
    return result;
}

module.exports = azureFunctionWrapper(deleteDealHandler, {
    requireAuth: true,
    validateInput: null,
    enableCors: true,
    timeout: 15000
});
