const {
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const dbConfig = require('../shared/config/db.config');
const DealsService = require('../shared/services/dealService');
const authenticateToken = require('../shared/middleware/authenticateToken')
async function updateDealHandler(context, req) {
    await ensureDbConnection(dbConfig, context);
    
    const user = await authenticateToken(context, req);
    if (!user) {
        return; // Response already set by authenticateToken middleware
    }
    
    if (!user || user.role !== 'admin') {
        throw new ValidationError('Only admins can update deals');
    }
    
    const dealId = context.bindingData.dealId;
    const updateData = req.body;
    
    if (!dealId) {
        throw new ValidationError('Deal ID is required');
    }
    
    if (!updateData || Object.keys(updateData).length === 0) {
        throw new ValidationError('Update data is required');
    }
    
    const deal = await DealsService.updateDeal(dealId, updateData, user._id);
    
    return {
        message: 'Deal updated successfully',
        data: deal
    };
}

module.exports = azureFunctionWrapper(updateDealHandler, {
    requireAuth: true,
    validateInput: null,
    enableCors: true,
    timeout: 15000
});
