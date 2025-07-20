// CreateDeal/index.js
const {
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const dbConfig = require('../shared/config/db.config');
const DealsService = require('../shared/services/dealService');
const authenticateToken = require('../shared/middleware/authenticateToken')
async function createDealHandler(context, req) {
    await ensureDbConnection(dbConfig, context);
    
    const user = await authenticateToken(context, req);
    if (!user) {
        return; // Response already set by authenticateToken middleware
    }
    
    if (!user || user.role !== 'admin') {
        throw new ValidationError('Only admins can create deals');
    }
    
    const dealData = req.body;
    
    if (!dealData || Object.keys(dealData).length === 0) {
        throw new ValidationError('Deal data is required');
    }
    
    const deal = await DealsService.createDeal(dealData, user._id);
    
    return {
        message: 'Deal created successfully',
        data: deal
    };
}

module.exports = azureFunctionWrapper(createDealHandler, {
    requireAuth: true,
    validateInput: null,
    enableCors: true,
    timeout: 15000
});
