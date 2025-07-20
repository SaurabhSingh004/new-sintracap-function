// getDashboard/index.js
const {
    azureFunctionWrapper,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const authenticateToken = require('../shared/middleware/authenticateToken');
const AuthService = require('../shared/services/authService');
const dbConfig = require('../shared/config/db.config');

// Main function handler
async function getDashboardHandler(context, req) {
    // Ensure database connection
    await ensureDbConnection(dbConfig, context);

    const authenticatedUser = await authenticateToken(context, req);
    if (!authenticatedUser) {
        return; // Response already set by authenticateToken middleware
    }

    // Get dashboard data using authenticated user info
    const dashboardData = await AuthService.getDashboardData(authenticatedUser._id, authenticatedUser.role);

    context.res = {
        status: 200,
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(dashboardData)
    };
}

// Export wrapped function
module.exports = azureFunctionWrapper(getDashboardHandler, {
    requireAuth: true,
    validateInput: null,
    enableCors: true,
    timeout: 15000
});
