const {
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const dbConfig = require('../shared/config/db.config');
const DealsService = require('../shared/services/dealService');
const authenticateToken = require('../shared/middleware/authenticateToken')
async function toggleAdminSelectedHandler(context, req) {
    await ensureDbConnection(dbConfig, context);
    
    const user = await authenticateToken(context, req);
    
    if (!user || user.role !== 'admin') {
        throw new ValidationError('Only admins can toggle admin selected status');
    }
    
    const dealId = context.bindingData.dealId;
    
    if (!dealId) {
        throw new ValidationError('Deal ID is required');
    }
    
    const deal = await DealsService.toggleAdminSelected(dealId, user._id);
    
    return {
        message: `Deal ${deal.adminSelected ? 'marked as' : 'removed from'} admin selected`,
        data: {
            dealId: deal._id,
            adminSelected: deal.adminSelected
        }
    };
}

module.exports = azureFunctionWrapper(toggleAdminSelectedHandler, {
    requireAuth: true,
    validateInput: null,
    enableCors: true,
    timeout: 10000
});