const { 
    azureFunctionWrapper,
    ValidationError,
    NotFoundError,
    DatabaseError,
    ensureDbConnection 
} = require('../shared/middleware/errorHandler');
const dbConfig = require('../shared/config/db.config');
const authenticateToken = require('../shared/middleware/authenticateToken');
const { deleteDocument } = require('../shared/services/profileService');

async function deleteDocumentHandler(context, req) {
    await ensureDbConnection(dbConfig, context);
    
    const { documentId } = req.params;
    const { type } = req.query; // 'document' or 'pitchDeck'
    
    if (!documentId) {
        throw new ValidationError('Document ID is required');
    }
    
    if (!type || !['document', 'pitchDeck'].includes(type)) {
        throw new ValidationError('Document type must be "document" or "pitchDeck"');
    }
    
    const authenticatedUser = await authenticateToken(context, req);
    if (!authenticatedUser) return;
    console.log("auth user", authenticatedUser.role);
    if (!['investor', 'founder'].includes(authenticatedUser.role)) {
        throw new ValidationError('Unauthorized role');
    }
    
    try {
        const result = await deleteDocument(
            authenticatedUser.email,
            authenticatedUser.role,
            documentId,
            type
        );
        
        return result;
        
    } catch (error) {
        context.log.error('Delete failed:', error);
        throw new DatabaseError(error.message);
    }
}

module.exports = azureFunctionWrapper(deleteDocumentHandler, {
    requireAuth: true,
    enableCors: true,
    timeout: 30000
});