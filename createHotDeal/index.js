// CreateHotDealsCategory/index.js
const {
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const AuthService = require('../shared/services/authService');
const dbConfig = require('../shared/config/db.config');
const HotDealsService = require('../shared/services/hotDealsService');

async function createHotDealsCategoryHandler(context, req) {
    await ensureDbConnection(dbConfig, context);
    
    const user = await AuthService.authenticate(req);
    
    if (!user || user.role !== 'admin') {
        throw new ValidationError('Only admins can create hot deals categories');
    }
    
    const categoryData = req.body;
    
    if (!categoryData || !categoryData.category || !categoryData.categoryDisplayName) {
        throw new ValidationError('Category and categoryDisplayName are required');
    }
    
    const category = await HotDealsService.createHotDealsCategory(categoryData, user._id);
    
    return {
        message: 'Hot deals category created successfully',
        data: category
    };
}

module.exports = azureFunctionWrapper(createHotDealsCategoryHandler, {
    requireAuth: true,
    validateInput: null,
    enableCors: true,
    timeout: 15000
});

// ========================================================================================

// UpdateHotDealsCategory/index.js
const {
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const AuthService = require('../shared/services/authService');
const dbConfig = require('../shared/config/db.config');
const HotDealsService = require('../shared/services/hotDealsService');

async function updateHotDealsCategoryHandler(context, req) {
    await ensureDbConnection(dbConfig, context);
    
    const user = await AuthService.authenticate(req);
    
    if (!user || user.role !== 'admin') {
        throw new ValidationError('Only admins can update hot deals categories');
    }
    
    const categoryId = context.bindingData.categoryId;
    const updateData = req.body;
    
    if (!categoryId) {
        throw new ValidationError('Category ID is required');
    }
    
    if (!updateData || Object.keys(updateData).length === 0) {
        throw new ValidationError('Update data is required');
    }
    
    const category = await HotDealsService.updateHotDealsCategory(categoryId, updateData, user._id);
    
    return {
        message: 'Hot deals category updated successfully',
        data: category
    };
}

module.exports = azureFunctionWrapper(updateHotDealsCategoryHandler, {
    requireAuth: true,
    validateInput: null,
    enableCors: true,
    timeout: 15000
});

// ========================================================================================

// DeleteHotDealsCategory/index.js
const {
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const AuthService = require('../shared/services/authService');
const dbConfig = require('../shared/config/db.config');
const HotDealsService = require('../shared/services/hotDealsService');

async function deleteHotDealsCategoryHandler(context, req) {
    await ensureDbConnection(dbConfig, context);
    
    const user = await AuthService.authenticate(req);
    
    if (!user || user.role !== 'admin') {
        throw new ValidationError('Only admins can delete hot deals categories');
    }
    
    const categoryId = context.bindingData.categoryId;
    
    if (!categoryId) {
        throw new ValidationError('Category ID is required');
    }
    
    const result = await HotDealsService.deleteHotDealsCategory(categoryId, user._id);
    
    return result;
}

module.exports = azureFunctionWrapper(deleteHotDealsCategoryHandler, {
    requireAuth: true,
    validateInput: null,
    enableCors: true,
    timeout: 15000
});

// ========================================================================================

// GetHotDealsCategory/index.js
const {
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const AuthService = require('../shared/services/authService');
const dbConfig = require('../shared/config/db.config');
const HotDealsService = require('../shared/services/hotDealsService');

async function getHotDealsCategoryHandler(context, req) {
    await ensureDbConnection(dbConfig, context);
    
    // Optional authentication
    let user = null;
    try {
        user = await AuthService.authenticate(req);
    } catch (error) {
        // Continue without authentication for public access
    }
    
    const categoryId = context.bindingData.categoryId;
    
    if (!categoryId) {
        throw new ValidationError('Category ID is required');
    }
    
    const category = await HotDealsService.getHotDealsCategoryById(categoryId);
    
    // Increment view count if accessed
    try {
        await HotDealsService.incrementCategoryView(categoryId);
    } catch (error) {
        // Continue if view increment fails
        context.log.warn('Failed to increment category view:', error.message);
    }
    
    return {
        message: 'Hot deals category retrieved successfully',
        data: category
    };
}

module.exports = azureFunctionWrapper(getHotDealsCategoryHandler, {
    requireAuth: false,
    validateInput: null,
    enableCors: true,
    timeout: 10000
});

// ========================================================================================

// GetAllHotDealsCategories/index.js
const {
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const AuthService = require('../shared/services/authService');
const dbConfig = require('../shared/config/db.config');
const HotDealsService = require('../shared/services/hotDealsService');

async function getAllHotDealsCategoriesHandler(context, req) {
    await ensureDbConnection(dbConfig, context);
    
    // Optional authentication
    let user = null;
    try {
        user = await AuthService.authenticate(req);
    } catch (error) {
        // Continue without authentication for public access
    }
    
    const includeInactive = req.query.includeInactive === 'true' && user?.role === 'admin';
    
    const categories = await HotDealsService.getAllHotDealsCategories(includeInactive);
    
    return {
        message: 'Hot deals categories retrieved successfully',
        data: categories
    };
}

module.exports = azureFunctionWrapper(getAllHotDealsCategoriesHandler, {
    requireAuth: false,
    validateInput: null,
    enableCors: true,
    timeout: 15000
});

// ========================================================================================

// GetHotDealsByCategory/index.js
const {
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const AuthService = require('../shared/services/authService');
const dbConfig = require('../shared/config/db.config');
const HotDealsService = require('../shared/services/hotDealsService');

async function getHotDealsByCategoryHandler(context, req) {
    await ensureDbConnection(dbConfig, context);
    
    // Optional authentication
    let user = null;
    try {
        user = await AuthService.authenticate(req);
    } catch (error) {
        // Continue without authentication for public access
    }
    
    const categoryName = context.bindingData.categoryName;
    
    if (!categoryName) {
        throw new ValidationError('Category name is required');
    }
    
    const category = await HotDealsService.getHotDealsByCategory(categoryName);
    
    if (!category) {
        throw new ValidationError('Hot deals category not found');
    }
    
    // Increment view count
    try {
        await HotDealsService.incrementCategoryView(category._id);
    } catch (error) {
        context.log.warn('Failed to increment category view:', error.message);
    }
    
    return {
        message: 'Hot deals retrieved successfully',
        data: category
    };
}

module.exports = azureFunctionWrapper(getHotDealsByCategoryHandler, {
    requireAuth: false,
    validateInput: null,
    enableCors: true,
    timeout: 10000
});

// ========================================================================================

// AddDealToCategory/index.js
const {
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const AuthService = require('../shared/services/authService');
const dbConfig = require('../shared/config/db.config');
const HotDealsService = require('../shared/services/hotDealsService');

async function addDealToCategoryHandler(context, req) {
    await ensureDbConnection(dbConfig, context);
    
    const user = await AuthService.authenticate(req);
    
    if (!user || user.role !== 'admin') {
        throw new ValidationError('Only admins can add deals to hot deals categories');
    }
    
    const categoryId = context.bindingData.categoryId;
    const { dealId, position, featured, customTitle, customDescription, badge } = req.body;
    
    if (!categoryId) {
        throw new ValidationError('Category ID is required');
    }
    
    if (!dealId) {
        throw new ValidationError('Deal ID is required');
    }
    
    const options = {
        position,
        featured: featured || false,
        customTitle,
        customDescription,
        badge
    };
    
    const category = await HotDealsService.addDealToCategory(categoryId, dealId, user._id, options);
    
    return {
        message: 'Deal added to hot deals category successfully',
        data: category
    };
}

module.exports = azureFunctionWrapper(addDealToCategoryHandler, {
    requireAuth: true,
    validateInput: null,
    enableCors: true,
    timeout: 15000
});

// ========================================================================================

// RemoveDealFromCategory/index.js
const {
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const AuthService = require('../shared/services/authService');
const dbConfig = require('../shared/config/db.config');
const HotDealsService = require('../shared/services/hotDealsService');

async function removeDealFromCategoryHandler(context, req) {
    await ensureDbConnection(dbConfig, context);
    
    const user = await AuthService.authenticate(req);
    
    if (!user || user.role !== 'admin') {
        throw new ValidationError('Only admins can remove deals from hot deals categories');
    }
    
    const categoryId = context.bindingData.categoryId;
    const dealId = context.bindingData.dealId;
    
    if (!categoryId) {
        throw new ValidationError('Category ID is required');
    }
    
    if (!dealId) {
        throw new ValidationError('Deal ID is required');
    }
    
    const category = await HotDealsService.removeDealFromCategory(categoryId, dealId, user._id);
    
    return {
        message: 'Deal removed from hot deals category successfully',
        data: category
    };
}

module.exports = azureFunctionWrapper(removeDealFromCategoryHandler, {
    requireAuth: true,
    validateInput: null,
    enableCors: true,
    timeout: 15000
});

// ========================================================================================

// ReorderDealInCategory/index.js
const {
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const AuthService = require('../shared/services/authService');
const dbConfig = require('../shared/config/db.config');
const HotDealsService = require('../shared/services/hotDealsService');

async function reorderDealInCategoryHandler(context, req) {
    await ensureDbConnection(dbConfig, context);
    
    const user = await AuthService.authenticate(req);
    
    if (!user || user.role !== 'admin') {
        throw new ValidationError('Only admins can reorder deals in hot deals categories');
    }
    
    const categoryId = context.bindingData.categoryId;
    const dealId = context.bindingData.dealId;
    const { newPosition } = req.body;
    
    if (!categoryId) {
        throw new ValidationError('Category ID is required');
    }
    
    if (!dealId) {
        throw new ValidationError('Deal ID is required');
    }
    
    if (!newPosition || newPosition < 1) {
        throw new ValidationError('Valid new position is required');
    }
    
    const category = await HotDealsService.reorderDealInCategory(categoryId, dealId, newPosition, user._id);
    
    return {
        message: 'Deal reordered successfully',
        data: category
    };
}

module.exports = azureFunctionWrapper(reorderDealInCategoryHandler, {
    requireAuth: true,
    validateInput: null,
    enableCors: true,
    timeout: 15000
});

// ========================================================================================

// UpdateDealMetadata/index.js
const {
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const AuthService = require('../shared/services/authService');
const dbConfig = require('../shared/config/db.config');
const HotDealsService = require('../shared/services/hotDealsService');

async function updateDealMetadataHandler(context, req) {
    await ensureDbConnection(dbConfig, context);
    
    const user = await AuthService.authenticate(req);
    
    if (!user || user.role !== 'admin') {
        throw new ValidationError('Only admins can update deal metadata in hot deals categories');
    }
    
    const categoryId = context.bindingData.categoryId;
    const dealId = context.bindingData.dealId;
    const metadata = req.body;
    
    if (!categoryId) {
        throw new ValidationError('Category ID is required');
    }
    
    if (!dealId) {
        throw new ValidationError('Deal ID is required');
    }
    
    if (!metadata || Object.keys(metadata).length === 0) {
        throw new ValidationError('Metadata is required');
    }
    
    const category = await HotDealsService.updateDealMetadata(categoryId, dealId, metadata, user._id);
    
    return {
        message: 'Deal metadata updated successfully',
        data: category
    };
}

module.exports = azureFunctionWrapper(updateDealMetadataHandler, {
    requireAuth: true,
    validateInput: null,
    enableCors: true,
    timeout: 15000
});

// ========================================================================================

// GetFeaturedDeals/index.js
const {
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const AuthService = require('../shared/services/authService');
const dbConfig = require('../shared/config/db.config');
const HotDealsService = require('../shared/services/hotDealsService');

async function getFeaturedDealsHandler(context, req) {
    await ensureDbConnection(dbConfig, context);
    
    // Optional authentication
    let user = null;
    try {
        user = await AuthService.authenticate(req);
    } catch (error) {
        // Continue without authentication for public access
    }
    
    const featuredDeals = await HotDealsService.getAllFeaturedDeals();
    
    return {
        message: 'Featured deals retrieved successfully',
        data: featuredDeals
    };
}

module.exports = azureFunctionWrapper(getFeaturedDealsHandler, {
    requireAuth: false,
    validateInput: null,
    enableCors: true,
    timeout: 10000
});

// ========================================================================================

// AutoRefreshCategory/index.js
const {
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const AuthService = require('../shared/services/authService');
const dbConfig = require('../shared/config/db.config');
const HotDealsService = require('../shared/services/hotDealsService');

async function autoRefreshCategoryHandler(context, req) {
    await ensureDbConnection(dbConfig, context);
    
    const user = await AuthService.authenticate(req);
    
    if (!user || user.role !== 'admin') {
        throw new ValidationError('Only admins can trigger auto-refresh for hot deals categories');
    }
    
    const categoryId = context.bindingData.categoryId;
    
    if (!categoryId) {
        throw new ValidationError('Category ID is required');
    }
    
    const category = await HotDealsService.autoRefreshCategory(categoryId, user._id);
    
    return {
        message: 'Hot deals category auto-refreshed successfully',
        data: category
    };
}

module.exports = azureFunctionWrapper(autoRefreshCategoryHandler, {
    requireAuth: true,
    validateInput: null,
    enableCors: true,
    timeout: 30000 // Longer timeout for auto-refresh
});

// ========================================================================================

// AddMultipleDealsToCategory/index.js
const {
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const AuthService = require('../shared/services/authService');
const dbConfig = require('../shared/config/db.config');
const HotDealsService = require('../shared/services/hotDealsService');

async function addMultipleDealsToCategoryHandler(context, req) {
    await ensureDbConnection(dbConfig, context);
    
    const user = await AuthService.authenticate(req);
    
    if (!user || user.role !== 'admin') {
        throw new ValidationError('Only admins can add multiple deals to hot deals categories');
    }
    
    const categoryId = context.bindingData.categoryId;
    const { dealIds } = req.body;
    
    if (!categoryId) {
        throw new ValidationError('Category ID is required');
    }
    
    if (!dealIds || !Array.isArray(dealIds) || dealIds.length === 0) {
        throw new ValidationError('Deal IDs array is required');
    }
    
    const category = await HotDealsService.addMultipleDealsToCategory(categoryId, dealIds, user._id);
    
    return {
        message: `${dealIds.length} deals processed for hot deals category`,
        data: category
    };
}

module.exports = azureFunctionWrapper(addMultipleDealsToCategoryHandler, {
    requireAuth: true,
    validateInput: null,
    enableCors: true,
    timeout: 30000
});