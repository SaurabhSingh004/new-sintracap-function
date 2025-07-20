// verifyDocument/index.js
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
async function verifyDocumentHandler(context, req) {
    // Ensure database connection
    await ensureDbConnection(dbConfig, context);
    
    // Extract and validate input
    const { userId, documentId, isVerified, role } = req.body;
    
    const validatedUserId = validateRequired(userId, 'userId');
    const validatedDocumentId = validateRequired(documentId, 'documentId');
    const validatedRole = validateRequired(role, 'role');
    
    // Validate userId format
    if (!mongoose.Types.ObjectId.isValid(validatedUserId)) {
        throw new ValidationError('Invalid user ID format');
    }
    
    // Validate role
    if (!['investor', 'founder'].includes(validatedRole)) {
        throw new ValidationError('Role must be either "investor" or "founder"');
    }
    
    // Validate isVerified
    if (typeof isVerified !== 'boolean') {
        throw new ValidationError('isVerified must be a boolean value');
    }
    
    try {
        // Determine collection based on role
        const collectionName = validatedRole === 'founder' ? 'companyprofiles' : 'investorprofiles';
        const collection = mongoose.connection.db.collection(collectionName);
        
        // Set verification timestamp
        const now = new Date();
        
        // Create update object
        const updateObj = {
            "documents.$.isVerified": isVerified
        };
        
        // Only set verifiedAt if we're verifying the document
        if (isVerified) {
            updateObj["documents.$.verifiedAt"] = now;
        } else {
            updateObj["documents.$.verifiedAt"] = null;
        }
        
        // Update document verification based on documentId
        const result = await collection.updateOne(
            { 
                _id: new mongoose.Types.ObjectId(validatedUserId),
                "documents.documentId": validatedDocumentId
            },
            { $set: updateObj }
        );
        
        if (result.matchedCount === 0) {
            // Try to find if user exists first
            const userExists = await collection.findOne(
                { _id: new mongoose.Types.ObjectId(validatedUserId) }
            );
            
            if (!userExists) {
                throw new NotFoundError(`${validatedRole === 'founder' ? 'Company' : 'Investor'} not found`);
            }
            
            throw new NotFoundError('Document not found for the specified user');
        }
        
        if (result.modifiedCount === 0) {
            throw new DatabaseError('Failed to update document verification status');
        }
        
        // Fetch the updated user to return current documents array
        const updatedUser = await collection.findOne(
            { _id: new mongoose.Types.ObjectId(validatedUserId) },
            { projection: { documents: 1 } }
        );
        
        // Record document activity (non-blocking)
        try {
            await recordDocumentActivity(
                validatedUserId, 
                validatedDocumentId, 
                isVerified, 
                validatedRole, 
                req.body.adminId
            );
        } catch (historyError) {
            context.log.error('Failed to record document history:', historyError);
            // Don't fail the main operation for logging errors
        }
        
        return {
            message: `Document ${isVerified ? 'verified' : 'unverified'} successfully`,
            data: {
                documents: updatedUser.documents || []
            }
        };
        
    } catch (error) {
        if (error instanceof ValidationError || error instanceof NotFoundError) {
            throw error;
        }
        
        context.log.error('Database operation failed:', error);
        throw new DatabaseError('Failed to verify document');
    }
}

// Helper function to record document activity
async function recordDocumentActivity(userId, documentId, isVerified, userRole, adminId) {
    const historyCollection = mongoose.connection.db.collection('documentActivityLogs');
    
    await historyCollection.insertOne({
        userId: new mongoose.Types.ObjectId(userId),
        documentId: documentId,
        action: isVerified ? 'verify' : 'unverify',
        timestamp: new Date(),
        adminId: adminId ? new mongoose.Types.ObjectId(adminId) : null,
        userRole: userRole
    });
}

// Input validation function
function validateVerifyDocumentInput(req) {
    if (!req.body) {
        throw new ValidationError('Request body is required');
    }
    
    const { userId, documentId, isVerified, role } = req.body;
    
    // Check required fields
    if (!userId) {
        throw new ValidationError('User ID is required');
    }
    
    if (!documentId) {
        throw new ValidationError('Document ID is required');
    }
    
    if (!role) {
        throw new ValidationError('Role is required');
    }
    
    if (typeof isVerified !== 'boolean') {
        throw new ValidationError('isVerified must be a boolean value');
    }
    
    // Validate userId format
    if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw new ValidationError('Invalid user ID format');
    }
    
    // Validate role
    if (!['investor', 'founder'].includes(role)) {
        throw new ValidationError('Role must be either "investor" or "founder"');
    }
}

// Export wrapped function
module.exports = azureFunctionWrapper(verifyDocumentHandler, {
    requireAuth: false, // Set to true if admin authentication is required
    validateInput: validateVerifyDocumentInput,
    enableCors: true,
    timeout: 15000
});