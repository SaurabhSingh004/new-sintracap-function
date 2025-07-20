// requestDocuments/index.js
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
async function requestDocumentsHandler(context, req) {
    // Ensure database connection
    await ensureDbConnection(dbConfig, context);
    
    // Extract and validate input
    const { userId, documents, role } = req.body;
    
    const validatedUserId = validateRequired(userId, 'userId');
    const validatedRole = validateRequired(role, 'role');
    
    // Validate userId format
    if (!mongoose.Types.ObjectId.isValid(validatedUserId)) {
        throw new ValidationError('Invalid user ID format');
    }
    
    // Validate role
    if (!['investor', 'founder'].includes(validatedRole)) {
        throw new ValidationError('Role must be either "investor" or "founder"');
    }
    
    // Validate documents array
    if (!documents || !Array.isArray(documents) || documents.length === 0) {
        throw new ValidationError('At least one document request is required');
    }
    
    // Validate document request format
    const isValidFormat = documents.every(doc => 
        doc.name && typeof doc.name === 'string' && 
        doc.docType && typeof doc.docType === 'string'
    );
    
    if (!isValidFormat) {
        throw new ValidationError('Invalid document request format. Each document must have a name and docType.');
    }
    
    try {
        // Determine collection based on role
        const collectionName = validatedRole === 'founder' ? 'companyprofiles' : 'investorprofiles';
        const collection = mongoose.connection.db.collection(collectionName);
        
        // Check if user exists
        const user = await collection.findOne(
            { _id: new mongoose.Types.ObjectId(validatedUserId) }
        );
        
        if (!user) {
            throw new NotFoundError(`${validatedRole === 'founder' ? 'Company' : 'Investor'} not found`);
        }
        
        // Prepare document requests with timestamps
        const documentRequests = documents.map(doc => ({
            documentId: new mongoose.Types.ObjectId().toString(),
            name: doc.name.trim(),
            docType: doc.docType.trim(),
            requestedAt: new Date(),
            status: 'pending'
        }));
        
        // Update user with new document requests
        const result = await collection.updateOne(
            { _id: new mongoose.Types.ObjectId(validatedUserId) },
            { $push: { requestedDocuments: { $each: documentRequests } } }
        );
        
        if (result.modifiedCount === 0) {
            throw new DatabaseError('Failed to request documents');
        }
        
        // Record in activity log (non-blocking)
        try {
            await recordDocumentActivity(validatedUserId, validatedRole, documentRequests, req.body.adminId);
        } catch (historyError) {
            context.log.error('Failed to record document request history:', historyError);
            // Don't fail the main operation for logging errors
        }
        
        // Fetch updated user data
        const updatedUser = await collection.findOne(
            { _id: new mongoose.Types.ObjectId(validatedUserId) },
            { projection: { requestedDocuments: 1 } }
        );
        
        return {
            message: `${documentRequests.length} document${documentRequests.length === 1 ? '' : 's'} requested successfully`,
            data: {
                requestedDocuments: updatedUser.requestedDocuments || []
            }
        };
        
    } catch (error) {
        if (error instanceof ValidationError || error instanceof NotFoundError) {
            throw error;
        }
        
        context.log.error('Database operation failed:', error);
        throw new DatabaseError('Failed to request documents');
    }
}

// Helper function to record document activity
async function recordDocumentActivity(userId, userRole, documentRequests, adminId) {
    const historyCollection = mongoose.connection.db.collection('documentActivityLogs');
    
    await historyCollection.insertOne({
        userId: new mongoose.Types.ObjectId(userId),
        action: 'document_request',
        timestamp: new Date(),
        adminId: adminId ? new mongoose.Types.ObjectId(adminId) : null,
        userRole: userRole,
        documents: documentRequests.map(doc => ({
            documentId: doc.documentId,
            name: doc.name,
            docType: doc.docType
        }))
    });
}

// Input validation function
function validateRequestDocumentsInput(req) {
    if (!req.body) {
        throw new ValidationError('Request body is required');
    }
    
    const { userId, documents, role } = req.body;
    
    // Check required fields
    if (!userId) {
        throw new ValidationError('User ID is required');
    }
    
    if (!role) {
        throw new ValidationError('Role is required');
    }
    
    if (!documents) {
        throw new ValidationError('Documents array is required');
    }
    
    // Validate userId format
    if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw new ValidationError('Invalid user ID format');
    }
    
    // Validate role
    if (!['investor', 'founder'].includes(role)) {
        throw new ValidationError('Role must be either "investor" or "founder"');
    }
    
    // Validate documents array
    if (!Array.isArray(documents)) {
        throw new ValidationError('Documents must be an array');
    }
    
    if (documents.length === 0) {
        throw new ValidationError('At least one document request is required');
    }
    
    // Validate each document
    documents.forEach((doc, index) => {
        if (!doc.name || typeof doc.name !== 'string' || doc.name.trim().length === 0) {
            throw new ValidationError(`Document at index ${index} must have a valid name`);
        }
        
        if (!doc.docType || typeof doc.docType !== 'string' || doc.docType.trim().length === 0) {
            throw new ValidationError(`Document at index ${index} must have a valid docType`);
        }
    });
}

// Export wrapped function
module.exports = azureFunctionWrapper(requestDocumentsHandler, {
    requireAuth: false, // Set to true if admin auth is required
    validateInput: validateRequestDocumentsInput,
    enableCors: true,
    timeout: 20000
});