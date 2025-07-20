const { 
    azureFunctionWrapper,
    ValidationError,
    DatabaseError,
    ensureDbConnection 
} = require('../shared/middleware/errorHandler');
const constants = require('../shared/config/constants');
const dbConfig = require('../shared/config/db.config');
const authenticateToken = require('../shared/middleware/authenticateToken');
const DealMediaService = require('../shared/services/dealMediaService'); // Your existing service
const DealMediaDeleteValidator = require('../shared/validators/deleteDealMediaValidator');

// Main function handler
async function deleteDealMediaHandler(context, req) {
    try {
        // Ensure database connection
        await ensureDbConnection(dbConfig, context);
        
        // Authenticate user
        const authenticatedUser = await authenticateToken(context, req);
        if (!authenticatedUser) {
            return; // Response already set by authenticateToken middleware
        }
        
        // Validate and extract request parameters
        const { dealId, mediaId } = DealMediaDeleteValidator.validateDeletionRequest(req);
        
        // Initialize service (assuming your service exists)
        const dealMediaService = new DealMediaService();
        
        // Perform deletion using your existing service method
        const result = await dealMediaService.deleteDealMedia(
            dealId,
            mediaId,
            authenticatedUser._id.toString(),
            authenticatedUser.role
        );
        
        // Log operation
        context.log(`Successfully deleted media ${mediaId} from deal ${dealId} by user ${authenticatedUser._id}`);
        
        // Return consistent response format
        return {
            message: result.message,
            data: {
                dealId: dealId,
                deletedMediaId: mediaId,
                deletedBy: authenticatedUser._id,
                deletedAt: new Date().toISOString()
            }
        };
        
    } catch (error) {
        context.log.error('Error in deleteDealMediaHandler:', error);
        
        if (error instanceof ValidationError) {
            throw error;
        }
        
        throw new DatabaseError('Failed to delete deal media');
    }
}

// Export wrapped function
module.exports = azureFunctionWrapper(deleteDealMediaHandler, {
    requireAuth: true,
    validateInput: DealMediaDeleteValidator.validateRequestInput,
    enableCors: true,
    timeout: constants.TIMEOUTS.DEFAULT
});