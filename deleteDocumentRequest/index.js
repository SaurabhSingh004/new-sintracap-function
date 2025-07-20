// deleteDocumentRequest/index.js
const { 
    azureFunctionWrapper, 
    validateRequired,
    ValidationError,
    NotFoundError,
    DatabaseError,
    ensureDbConnection 
} = require('../shared/middleware/errorHandler');
const dbConfig = require('../shared/config/db.config');
const mongoose = require('mongoose');

// Main function handler
async function deleteDocumentRequestHandler(context, req) {
    // Ensure database connection
    await ensureDbConnection(dbConfig, context);
    
    // Extract and validate parameters
    const { userId, documentId } = req.body;
    const validatedUserId = validateRequired(userId, 'userId');
    const validatedDocumentId = validateRequired(documentId, 'documentId');
    
    // Validate userId format
    if (!mongoose.Types.ObjectId.isValid(validatedUserId)) {
        throw new ValidationError('Invalid user ID format');
    }
    
    try {
        // Access the database collection
        const db = mongoose.connection.db;
        const usersCollection = db.collection('sintracapusers');
        
        // Check if user exists
        const user = await usersCollection.findOne(
            { _id: new mongoose.Types.ObjectId(validatedUserId) }
        );
        
        if (!user) {
            throw new NotFoundError('User not found');
        }
        
        // Try different approaches to remove the document request
        let result = await tryRemoveDocumentRequest(usersCollection, validatedUserId, validatedDocumentId, req.body.name);
        
        if (result.modifiedCount === 0) {
            throw new NotFoundError('Document request not found');
        }
        
        // Fetch updated user data
        const updatedUser = await usersCollection.findOne(
            { _id: new mongoose.Types.ObjectId(validatedUserId) },
            { projection: { requestedDocuments: 1 } }
        );
        
        return {
            message: 'Document request deleted successfully',
            data: {
                requestedDocuments: updatedUser.requestedDocuments || []
            }
        };
        
    } catch (error) {
        context.log.error('Database operation failed:', error);
        
        if (error instanceof NotFoundError || error instanceof ValidationError) {
            throw error;
        }
        
        throw new DatabaseError('Failed to delete document request');
    }
}

// Helper function to try different removal strategies
async function tryRemoveDocumentRequest(usersCollection, userId, documentId, documentName) {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    
    // Strategy 1: Remove by documentId field
    let result = await usersCollection.updateOne(
        { _id: userObjectId },
        { $pull: { requestedDocuments: { documentId: documentId } } }
    );
    
    if (result.modifiedCount > 0) {
        return result;
    }
    
    // Strategy 2: Remove by _id field (try as ObjectId)
    if (mongoose.Types.ObjectId.isValid(documentId)) {
        try {
            result = await usersCollection.updateOne(
                { _id: userObjectId },
                { $pull: { requestedDocuments: { _id: new mongoose.Types.ObjectId(documentId) } } }
            );
            
            if (result.modifiedCount > 0) {
                return result;
            }
        } catch (error) {
            // Continue to next strategy if ObjectId conversion fails
        }
    }
    
    // Strategy 3: Remove by _id field (as string)
    result = await usersCollection.updateOne(
        { _id: userObjectId },
        { $pull: { requestedDocuments: { _id: documentId } } }
    );
    
    if (result.modifiedCount > 0) {
        return result;
    }
    
    // Strategy 4: Remove by name (if provided)
    if (documentName) {
        result = await usersCollection.updateOne(
            { _id: userObjectId },
            { $pull: { requestedDocuments: { name: documentName } } }
        );
    }
    
    return result;
}

// Input validation function
function validateDeleteDocumentRequestInput(req) {
    if (!req.body) {
        throw new ValidationError('Request body is required');
    }
    
    const { userId, documentId } = req.body;
    
    if (!userId) {
        throw new ValidationError('User ID is required');
    }
    
    if (!documentId) {
        throw new ValidationError('Document ID is required');
    }
    
    // Validate userId format
    if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw new ValidationError('Invalid user ID format');
    }
}

// Export wrapped function
module.exports = azureFunctionWrapper(deleteDocumentRequestHandler, {
    requireAuth: false, // Set to true if authentication is required
    validateInput: validateDeleteDocumentRequestInput,
    enableCors: true,
    timeout: 15000
});