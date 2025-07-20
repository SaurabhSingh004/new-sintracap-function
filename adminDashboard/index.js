// functions/getDashboard/index.js
const {
    azureFunctionWrapper,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const DashboardService = require('../shared/services/DashboardService');
const dbConfig = require('../shared/config/db.config');

async function getDashboardHandler(context, req) {
  try {
    await ensureDbConnection(dbConfig, context);

    const dashboardData = await DashboardService.getDashboardData();

    context.res = {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: dashboardData
    };
  } catch (error) {
    context.log.error('Error fetching dashboard data:', error);

    context.res = {
      status: 500,
      body: {
        success: false,
        message: error.message || 'Failed to fetch dashboard data'
      }
    };
  }
}

module.exports = azureFunctionWrapper(getDashboardHandler, {
  requireAuth: true,
  validateInput: null,
  enableCors: true,
  timeout: 20000
});
