// saveDocument/index.js
const { 
    azureFunctionWrapper,
    ValidationError,
    NotFoundError,
    DatabaseError,
    ensureDbConnection 
} = require('../shared/middleware/errorHandler');
const dbConfig = require('../shared/config/db.config');
const mongoose = require('mongoose');
const authenticateToken = require('../shared/middleware/authenticateToken');
// Main function handler
async function saveDocumentHandler(context, req) {
    // Ensure database connection
    await ensureDbConnection(dbConfig, context);
    
    // Extract document URLs from request body
    const { documentUrls } = req.body;
    
    if (!documentUrls || (!Array.isArray(documentUrls) && typeof documentUrls !== 'object')) {
        throw new ValidationError('Document URLs are required and must be an array or object');
    }
    
    // Get authenticated user info
    const authenticatedUser = await authenticateToken(context, req);
    if (!authenticatedUser) {
        return; // Response already set by authenticateToken middleware
    }

    // Validate user role
    if (!['investor', 'founder'].includes(authenticatedUser.role)) {
        throw new ValidationError('Unauthorized role');
    }
    
    try {
        // Format documents
        const docsArray = Array.isArray(documentUrls) ? documentUrls : [documentUrls];
        
        const formattedDocs = docsArray.map(doc => ({   
            documentId: new mongoose.Types.ObjectId().toString(),
            name: doc.originalName || doc.name || 'Document',
            url: doc.url || '',
            type: doc.contentType || doc.type || 'application/octet-stream',
            uploadedAt: new Date(),
            isVerified: false
        }));
        
        // Determine collection based on user role
        const db = mongoose.connection.db;
        const collectionName = authenticatedUser.role === 'investor' ? 'investorprofiles' : 'companyprofiles';
        const usersCollection = db.collection(collectionName);
        
        // Convert user ID to ObjectId
        const userId = convertToObjectId(authenticatedUser._id);
        
        context.log(`Updating documents for user: ${userId} in collection: ${collectionName}`);
        
        // Check if user exists
        const userDoc = await usersCollection.findOne({ _id: userId });
        if (!userDoc) {
            throw new NotFoundError('User not found');
        }
        
        // Update user with new documents
        const result = await usersCollection.updateOne(
            { _id: userId },
            {
                $push: {
                    documents: {
                        $each: formattedDocs
                    }
                }
            }
        );
        
        if (result.modifiedCount === 0) {
            throw new DatabaseError('Failed to update user documents');
        }
        
        return {
            message: 'Documents uploaded successfully',
            data: {
                role: authenticatedUser.role,
                documentCount: formattedDocs.length,
                uploadedDocuments: formattedDocs.map(doc => ({
                    documentId: doc.documentId,
                    name: doc.name,
                    type: doc.type
                }))
            }
        };
        
    } catch (error) {
        context.log.error('Database operation failed:', error);
        
        if (error instanceof ValidationError || error instanceof NotFoundError) {
            throw error;
        }
        
        throw new DatabaseError('Failed to upload documents');
    }
}

// Helper function to convert various ID formats to ObjectId
function convertToObjectId(id) {
    try {
        // If it's already an ObjectId instance
        if (id instanceof mongoose.Types.ObjectId) {
            return id;
        } 
        // If it's a string representation of an ObjectId
        else if (typeof id === 'string') {
            return new mongoose.Types.ObjectId(id);
        } 
        // If it's an object with a toString method
        else if (id && id.toString) {
            return new mongoose.Types.ObjectId(id.toString());
        } else {
            throw new Error(`Invalid ID format: ${id}`);
        }
    } catch (error) {
        throw new ValidationError('Invalid user ID format');
    }
}

// Input validation function
function validateSaveDocumentInput(req) {
    if (!req.body) {
        throw new ValidationError('Request body is required');
    }
    
    const { documentUrls } = req.body;
    
    if (!documentUrls) {
        throw new ValidationError('Document URLs are required');
    }
    
    if (!Array.isArray(documentUrls) && typeof documentUrls !== 'object') {
        throw new ValidationError('Document URLs must be an array or object');
    }
    
    // Validate document format
    const docsArray = Array.isArray(documentUrls) ? documentUrls : [documentUrls];
    
    docsArray.forEach((doc, index) => {
        if (!doc.url || typeof doc.url !== 'string') {
            throw new ValidationError(`Document at index ${index} must have a valid URL`);
        }
        
        if (doc.name && typeof doc.name !== 'string') {
            throw new ValidationError(`Document at index ${index} must have a valid name if provided`);
        }
    });
}

// Export wrapped function
module.exports = azureFunctionWrapper(saveDocumentHandler, {
    requireAuth: true, // Authentication required for document upload
    validateInput: validateSaveDocumentInput,
    enableCors: true,
    timeout: 30000 // 30 seconds for document processing
});