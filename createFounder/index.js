// functions/createFounderProfile/index.js
const {
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const dbConfig = require('../shared/config/db.config');
const CompanyProfileService = require('../shared/services/createFounderService');

async function createFounderProfileHandler(context, req) {
  const { email, profileData } = req.body || {};
  console.log('createFounderProfileHandler called with:', { email, profileData });
    await ensureDbConnection(dbConfig, context);    
  // Basic HTTP‐level validation
  if (!email || typeof email !== 'string') {
    throw new ValidationError('Founder email is required');
  }
  if (!profileData || typeof profileData !== 'object') {
    throw new ValidationError('Profile data must be provided');
  }

//   const authenticatedUser = await authenticateToken(context, req);
//       if (!authenticatedUser) {
//           return; // Response already set by authenticateToken middleware
//       }
    

  // Delegate to the service
  const result = await CompanyProfileService.createFounderProfile(email, profileData);
  return {
    status: 200,
    body: {
      message: 'Founder profile created successfully',
      ...result
    }
  };
}

module.exports = azureFunctionWrapper(createFounderProfileHandler, {
  requireAuth: true,
  validateInput: null,
  enableCors: true,
  timeout: 15000
});
