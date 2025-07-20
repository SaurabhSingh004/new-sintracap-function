const {
    azureFunctionWrapper,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const dbConfig = require('../shared/config/db.config');
const DealsService = require('../shared/services/dealService');

async function getAllDealsHandler(context, req) {
    await ensureDbConnection(dbConfig, context);
    
    const filters = {
        category: req.query.category,
        subcategory: req.query.subcategory,
        status: req.query.status ? req.query.status.split(',') : undefined,
        adminSelected: req.query.adminSelected === 'true' ? true : req.query.adminSelected === 'false' ? false : undefined,
        isHotDeal: req.query.isHotDeal === 'true' ? true : req.query.isHotDeal === 'false' ? false : undefined,
        search: req.query.search,
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20,
        sortBy: req.query.sortBy || 'createdAt',
        sortOrder: req.query.sortOrder || 'desc'
    };
    
    const result = await DealsService.getAllDeals(filters);
    
    return {
        message: 'Deals retrieved successfully',
        data: result
    };
}

module.exports = azureFunctionWrapper(getAllDealsHandler, {
    requireAuth: false,
    validateInput: null,
    enableCors: true,
    timeout: 15000
});