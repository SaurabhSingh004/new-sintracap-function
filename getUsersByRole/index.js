// getUsersByRole/index.js
const { 
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection 
} = require('../shared/middleware/errorHandler');
const AuthService = require('../shared/services/authService');
const dbConfig = require('../shared/config/db.config');

// Main function handler
async function getUsersByRoleHandler(context, req) {
    // Ensure database connection
    await ensureDbConnection(dbConfig, context);
    
    // Get role parameter from the route
    const role = context.bindingData.role;
    
    if (!role || !['investor', 'founder'].includes(role)) {
        throw new ValidationError('Valid role is required (investor or founder)');
    }
    
    // Extract pagination parameters from query string
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    
    // Validate pagination parameters
    if (page < 1) {
        throw new ValidationError('Page number must be greater than 0');
    }
    
    if (limit < 1 || limit > 100) {
        throw new ValidationError('Limit must be between 1 and 100');
    }
    
    // Fetch users by role with pagination
    const result = await AuthService.getUsersByRole(role, {
        page,
        limit,
        sortBy,
        sortOrder
    });
    
    if (!result.users || result.users.length === 0) {
        return {
            message: role === 'investor' 
                ? 'No investors found in the system.' 
                : 'No founders found in the system.',
            data: [],
            pagination: {
                currentPage: page,
                totalPages: 0,
                totalCount: 0,
                pageSize: limit,
                hasNextPage: false,
                hasPreviousPage: false
            }
        };
    }
    
    const totalPages = Math.ceil(result.totalCount / limit);
    
    return {
        message: `Found ${result.totalCount} ${role}${result.totalCount !== 1 ? 's' : ''} (page ${page} of ${totalPages})`,
        data: result.users,
        pagination: {
            currentPage: page,
            totalPages,
            totalCount: result.totalCount,
            pageSize: limit,
            hasNextPage: page < totalPages,
            hasPreviousPage: page > 1
        }
    };
}

// Export wrapped function
module.exports = azureFunctionWrapper(getUsersByRoleHandler, {
    requireAuth: false, // Set to true if admin auth is required
    validateInput: null,
    enableCors: true,
    timeout: 15000
});
