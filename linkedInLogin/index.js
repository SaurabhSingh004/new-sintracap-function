// linkedInLogin/index.js
const { v4: uuidv4 } = require('uuid');
const cacheService = require('../shared/services/cacheService');
const constants = require('../shared/config/constants');

// Custom wrapper for LinkedIn login (handles redirects)
function linkedInLoginWrapper(handler) {
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
            context.log.error("LinkedIn auth initiation error:", error);
            
            // Redirect to frontend error page
            const frontendUrl = constants.FRONTEND_URL || 'https://sintra.capital';
            const errorMessage = encodeURIComponent(error.message || 'Failed to initiate LinkedIn authentication');
            
            context.res = {
                status: 302,
                headers: {
                    "Location": `${frontendUrl}/auth/error?message=${errorMessage}`,
                    "Access-Control-Allow-Origin": "*"
                },
                body: null
            };
        }
    };
}

// Main function handler
async function linkedInLoginHandler(context, req) {
    // Generate a state parameter for CSRF protection
    const state = uuidv4();
    
    // Extract role from query parameters (default to 'founder' if not provided)
    const role = req.query.role || 'founder';
    // Validate role
    if (!['investor', 'founder'].includes(role)) {
        throw new Error('Invalid role. Must be either "investor" or "founder"');
    }
    
    context.log('LinkedIn auth initiation:', { state, role });
    
    // Store role and other data in cache associated with state
    const stateData = {
        role: role,
        timestamp: Date.now(),
        userAgent: req.headers['user-agent'] || 'unknown'
    };
    
    // Store in cache for 10 minutes (600 seconds)
    await cacheService.set(state, stateData, 600);
    
    // LinkedIn OAuth parameters from constants
    const clientId = constants.LINKEDIN_CLIENT_ID || '86yfv12jlk4udi';
    const redirectUri = constants.LINKEDIN_REDIRECT_URI || 'https://sintracap-app.azurewebsites.net/api/linkedin-callback';
    const scope = 'openid email profile';
    
    // Construct LinkedIn authorization URL with state parameter
    const linkedInAuthUrl = `https://www.linkedin.com/oauth/v2/authorization?` +
        `response_type=code` +
        `&client_id=${clientId}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=${encodeURIComponent(scope)}` +
        `&state=${encodeURIComponent(state)}`;
        
    context.log('LinkedIn auth URL generated for role:', role);
    
    // Set redirect response
    context.res = {
        status: 302,
        headers: {
            "Location": linkedInAuthUrl,
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization"
        },
        body: null
    };
}

// Export custom wrapped function
module.exports = linkedInLoginWrapper(linkedInLoginHandler);