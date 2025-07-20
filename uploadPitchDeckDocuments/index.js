// upload-pitch-deck-documents/index.js
const { 
    azureFunctionWrapper,
    ValidationError,
    DatabaseError,
    ensureDbConnection 
} = require('../shared/middleware/errorHandler');
const multipart = require('parse-multipart');
const { BlobServiceClient } = require('@azure/storage-blob');
const { v4: uuidv4 } = require('uuid');
const constants = require('../shared/config/constants');
const dbConfig = require('../shared/config/db.config');
const CompanyProfile = require('../models/sintracapFounder');
const authenticateToken = require('../shared/middleware/authenticateToken');

// Azure Storage configuration
const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING || 
    "DefaultEndpointsProtocol=https;AccountName=sintracap;AccountKey=kGfGEuu7WUkWUkqXkvdceqzbTjI0a/dI+oEyboCIZDDkBdOtFo60E38hGLKnEzM8AB8Ww2qxi7UZ+AStrcDDHw==;EndpointSuffix=core.windows.net";
const containerName = process.env.AZURE_CONTAINER_NAME || 'sintracap-media';

// Main function handler
async function uploadPitchDeckDocumentsHandler(context, req) {
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
        founderId = req.body.founderId;
    } else {
        founderId = authenticatedUser._id;
    }
    
    // Validate request
    if (!req.body || !req.headers['content-type']) {
        throw new ValidationError('Request body or content-type missing');
    }
    
    // Validate content type for multipart
    if (!req.headers['content-type'].includes('multipart')) {
        throw new ValidationError('Content-Type must be multipart/form-data');
    }
    
    try {
        // Parse multipart form data
        const bodyBuffer = Buffer.from(req.body);
        const boundary = multipart.getBoundary(req.headers['content-type']);
        const parts = multipart.Parse(bodyBuffer, boundary);
        
        if (!parts || parts.length === 0) {
            throw new ValidationError('No files found in the request');
        }
        
        // Validate file parts
        validatePitchDeckFileParts(parts);
        
        // Initialize Azure Blob Service
        const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        const containerClient = blobServiceClient.getContainerClient(containerName);
        
        // Create container if it doesn't exist
        await containerClient.createIfNotExists({
            access: 'blob' // Public read access for blobs only
        });
        
        // Upload files to Azure Blob Storage
        const uploadedDocuments = await uploadPitchDeckFilesToBlob(containerClient, parts);
        
        // Get founder profile
        const founderProfile = await CompanyProfile.findById(founderId);
        if (!founderProfile) {
            throw new ValidationError('Founder profile not found');
        }
        
        // Add uploaded documents to founder's pitch deck documents
        const documentsToAdd = uploadedDocuments.map(doc => ({
            documentId: doc.documentId,
            name: doc.originalName,
            url: doc.url,
            uploadedAt: new Date(),
            isVerified: false
        }));
        
        // Update founder profile with new pitch deck documents
        await CompanyProfile.findByIdAndUpdate(
            founderId,
            {
                $push: {
                    pitchDeckDocuments: { $each: documentsToAdd }
                }
            },
            { new: true }
        );
        
        context.log(`Successfully uploaded ${uploadedDocuments.length} pitch deck document(s) for founder ${founderId}`);
        
        return {
            message: `Successfully uploaded ${uploadedDocuments.length} pitch deck document(s)`,
            data: {
                documentCount: uploadedDocuments.length,
                documents: documentsToAdd
            }
        };
        
    } catch (error) {
        context.log.error('Error uploading pitch deck documents:', error);
        
        if (error instanceof ValidationError) {
            throw error;
        }
        
        throw new DatabaseError('Failed to upload pitch deck documents to storage');
    }
}

// Helper function to validate pitch deck file parts
function validatePitchDeckFileParts(parts) {
    const allowedTypes = [
        'application/pdf',
        'image/jpeg',
        'image/jpg', 
        'image/png',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ];
    
    const maxFileSize = 15 * 1024 * 1024; // 15MB for pitch decks
    
    for (const part of parts) {
        // Check if file has a name
        if (!part.filename) {
            throw new ValidationError('All files must have a filename');
        }
        
        // Check file size
        if (part.data.length > maxFileSize) {
            throw new ValidationError(`File ${part.filename} exceeds maximum size of 15MB`);
        }
        
        // Check file type
        if (!allowedTypes.includes(part.type)) {
            throw new ValidationError(`File ${part.filename} has unsupported type: ${part.type}. Allowed types: PDF, Images, Word, PowerPoint`);
        }
        
        // Check filename length
        if (part.filename.length > 255) {
            throw new ValidationError(`Filename ${part.filename} is too long`);
        }
        
        // Check for pitch deck related naming (optional validation)
        const filename = part.filename.toLowerCase();
        const pitchDeckKeywords = ['pitch', 'deck', 'presentation', 'investor', 'funding'];
        const hasPitchDeckKeyword = pitchDeckKeywords.some(keyword => filename.includes(keyword));
        
        if (!hasPitchDeckKeyword) {
            throw new ValidationError(`File ${part.filename} doesn't contain typical pitch deck keywords`);
        }
    }
}

// Helper function to upload pitch deck files to blob storage
async function uploadPitchDeckFilesToBlob(containerClient, parts) {
    const uploadedDocuments = [];
    
    for (const part of parts) {
        try {
            // Generate a unique file name with pitch deck prefix
            const fileExtension = part.filename.split('.').pop();
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const documentId = uuidv4();
            const blobName = `pitch-deck/${timestamp}-${documentId}.${fileExtension}`;
            
            // Upload to Azure Blob Storage
            const blockBlobClient = containerClient.getBlockBlobClient(blobName);
            
            await blockBlobClient.upload(part.data, part.data.length, {
                blobHTTPHeaders: {
                    blobContentType: part.type,
                    blobContentDisposition: `attachment; filename="${part.filename}"`
                },
                metadata: {
                    originalName: part.filename,
                    uploadDate: new Date().toISOString(),
                    fileSize: part.data.length.toString(),
                    documentType: 'pitch-deck',
                    documentId: documentId
                }
            });
            
            // Get the URL
            const blobUrl = blockBlobClient.url;
            
            uploadedDocuments.push({
                documentId: documentId,
                originalName: part.filename,
                url: blobUrl,
                contentType: part.type,
                size: part.data.length,
                blobName: blobName
            });
            
        } catch (uploadError) {
            throw new Error(`Failed to upload pitch deck file ${part.filename}: ${uploadError.message}`);
        }
    }
    
    return uploadedDocuments;
}

// Input validation function
function validateUploadPitchDeckInput(req) {
    if (!req.headers['content-type']) {
        throw new ValidationError('Content-Type header is required');
    }
    
    if (!req.headers['content-type'].includes('multipart')) {
        throw new ValidationError('Content-Type must be multipart/form-data');
    }
    
    if (!req.body) {
        throw new ValidationError('Request body is required');
    }
}

// Export wrapped function
module.exports = azureFunctionWrapper(uploadPitchDeckDocumentsHandler, {
    requireAuth: true,
    validateInput: validateUploadPitchDeckInput,
    enableCors: true,
    timeout: constants.TIMEOUTS.UPLOAD // 60 seconds for file upload
});