// linkedInCallback/index.js
const { 
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection 
} = require('../shared/middleware/errorHandler');
const AuthService = require('../shared/services/authService');
const cacheService = require('../shared/services/cacheService');
const dbConfig = require('../shared/config/db.config');
const constants = require('../shared/config/constants');

// Main function handler
async function linkedInCallbackHandler(context, req) {
    // Ensure database connection
    await ensureDbConnection(dbConfig, context);
    
    const { code, state, error } = req.query;
    let isNewUser = false;
    let role = null; // Default role
    let stateData = null;
    // Check for LinkedIn error response
    if (error) {
        throw new ValidationError(`LinkedIn authorization error: ${error}`);
    }
    
    if (!code) {
        throw new ValidationError('Missing authorization code');
    }
    
    if (!state) {
        throw new ValidationError('Missing state parameter');
    }
    
    // Retrieve role and other data from cache using state
    try {
        stateData = await cacheService.get(state);
        
        if (!stateData) {
            context.log('State data not found in cache, using default role');
        } else {
            role = stateData.role;
            
            // Verify timestamp (optional security check)
            const timeDiff = Date.now() - stateData.timestamp;
            if (timeDiff > 600000) { // 10 minutes
                context.log('State data expired, but proceeding with stored role');
            }
            
            context.log('Retrieved role from cache:', role);
        }
        
        // Clean up cache entry
        await cacheService.remove(state);
    } catch (cacheError) {
        context.log('Error retrieving state data from cache:', cacheError);
    }
    
    // Get redirect URI from constants
    const redirectUri = constants.LINKEDIN_REDIRECT_URI || 'https://sintracap-app.azurewebsites.net/api/linkedin-callback';
    
    // Exchange the code for token and user data
    const result = await AuthService.completeLinkedInAuth(code, redirectUri, role);
    isNewUser = result.isNewUser;
    
    const frontendUrl = constants.FRONTEND_URL || 'https://sintra.capital';
    let redirectUrl;
    
    context.log('LinkedIn callback result:', { 
        isNewUser, 
        role, 
        userEmail: result.user?.email,
        hasToken: !!result.token 
    });

    if (isNewUser) {
        // Redirect to signup page for new users
        redirectUrl = `${frontendUrl}/signup?token=${encodeURIComponent(result.token || 'null')}&user=${encodeURIComponent(JSON.stringify(result.user))}`;
    } else {
        // Redirect to login page for existing users
        redirectUrl = `${frontendUrl}/login?token=${encodeURIComponent(result.token || 'null')}&user=${encodeURIComponent(JSON.stringify(result.user))}`;
    }
    
    // Set redirect response
    context.res = {
        status: 302,
        headers: {
            "Location": redirectUrl,
            "Access-Control-Allow-Origin": "*"
        },
        body: null
    };
    
    return null; // No return needed for redirects
}

// Error handler for redirects
function handleLinkedInError(error, context, req) {
    context.log.error('LinkedIn callback error:', error);
    
    const frontendUrl = constants.FRONTEND_URL || 'https://sintra.capital';
    const errorMessage = encodeURIComponent(error.message || 'Authentication failed');
    
    // Default to login page for errors
    const redirectUrl = `${frontendUrl}/login?message=${errorMessage}`;
    
    context.res = {
        status: 302,
        headers: {
            "Location": redirectUrl,
            "Access-Control-Allow-Origin": "*" 
        },
        body: null
    };
}

// Custom wrapper for LinkedIn callback (handles redirects differently)
function linkedInCallbackWrapper(handler) {
    return async function wrappedFunction(context, req) {
        try {
            // Set basic headers
            context.res = {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
                }
            };

            // Handle OPTIONS request
            if (req.method === 'OPTIONS') {
                context.res.status = 204;
                return;
            }

            await handler(context, req);

        } catch (error) {
            handleLinkedInError(error, context, req);
        }
    };
}

// Export custom wrapped function
module.exports = linkedInCallbackWrapper(linkedInCallbackHandler);