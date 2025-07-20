// get-pitch-deck-documents/index.js
const { 
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection 
} = require('../shared/middleware/errorHandler');
const dbConfig = require('../shared/config/db.config');
const authenticateToken = require('../shared/middleware/authenticateToken');
const PitchDeckService = require('../shared/services/PitchDeckService');

// Main function handler
async function getPitchDeckDocumentsHandler(context, req) {
    // Ensure database connection
    await ensureDbConnection(dbConfig, context);
    
    // Authenticate user
    const authenticatedUser = await authenticateToken(context, req);
    if (!authenticatedUser) {
        return; // Response already set by authenticateToken middleware
    }
    
    // Get founder ID
    let founderId;
    if (authenticatedUser.role === 'admin' && req.params?.founderId) {
        founderId = req.params.founderId;
    } else {
        founderId = authenticatedUser._id;
    }
    
    try {
        const queryType = req.query.type || 'all';
        const limit = parseInt(req.query.limit) || null;
        const documentIds = req.query.documentIds ? req.query.documentIds.split(',') : null;
        
        let documents = [];
        let statistics = null;
        
        switch (queryType) {
            case 'all':
                documents = await PitchDeckService.getPitchDeckDocuments(founderId);
                break;
                
            case 'verified':
                documents = await PitchDeckService.getVerifiedPitchDeckDocuments(founderId);
                break;
                
            case 'recent':
                documents = await PitchDeckService.getRecentPitchDeckDocuments(founderId, limit || 5);
                break;
                
            case 'specific':
                if (!documentIds || documentIds.length === 0) {
                    throw new ValidationError('Document IDs are required for specific type query');
                }
                documents = await PitchDeckService.getPitchDeckDocumentsByIds(founderId, documentIds);
                break;
                
            case 'statistics':
                statistics = await PitchDeckService.getPitchDeckStatistics(founderId);
                break;
                
            default:
                throw new ValidationError('Invalid query type. Supported types: all, verified, recent, specific, statistics');
        }
        
        // Apply limit if specified and not already applied
        if (limit && queryType !== 'recent' && queryType !== 'statistics') {
            documents = documents.slice(0, limit);
        }
        
        const response = {
            message: 'Pitch deck documents retrieved successfully',
            data: {
                founderId,
                queryType,
                ...(statistics ? { statistics } : { documents, documentCount: documents.length })
            }
        };
        
        context.log(`Retrieved ${documents.length || 0} pitch deck documents for founder ${founderId} with query type: ${queryType}`);
        
        return response;
        
    } catch (error) {
        context.log.error('Error retrieving pitch deck documents:', error);
        
        if (error instanceof ValidationError) {
            throw error;
        }
        
        throw new ValidationError('Failed to retrieve pitch deck documents');
    }
}

// Input validation function
function validateGetPitchDeckInput(req) {
    const allowedTypes = ['all', 'verified', 'recent', 'specific', 'statistics'];
    const queryType = req.query.type || 'all';
    
    if (!allowedTypes.includes(queryType)) {
        throw new ValidationError(`Invalid query type: ${queryType}. Allowed types: ${allowedTypes.join(', ')}`);
    }
    
    if (queryType === 'specific' && !req.query.documentIds) {
        throw new ValidationError('Document IDs are required when type is "specific"');
    }
    
    if (req.query.limit && isNaN(parseInt(req.query.limit))) {
        throw new ValidationError('Limit must be a valid number');
    }
}

// Export wrapped function
module.exports = azureFunctionWrapper(getPitchDeckDocumentsHandler, {
    requireAuth: true,
    validateInput: validateGetPitchDeckInput,
    enableCors: true,
    timeout: 15000
});