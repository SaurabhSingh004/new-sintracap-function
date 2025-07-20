// upload-investor-documents/index.js
const { 
    azureFunctionWrapper,
    ValidationError,
    DatabaseError 
} = require('../shared/middleware/errorHandler');
const multipart = require('parse-multipart');
const { BlobServiceClient } = require('@azure/storage-blob');
const { v4: uuidv4 } = require('uuid');
const constants = require('../shared/config/constants');

// Azure Storage configuration
const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING || 
    "DefaultEndpointsProtocol=https;AccountName=sintracap;AccountKey=kGfGEuu7WUkWUkqXkvdceqzbTjI0a/dI+oEyboCIZDDkBdOtFo60E38hGLKnEzM8AB8Ww2qxi7UZ+AStrcDDHw==;EndpointSuffix=core.windows.net";
const containerName = process.env.AZURE_CONTAINER_NAME || 'sintracap-media';

// Main function handler
async function uploadInvestorDocumentsHandler(context, req) {
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
        validateFileParts(parts);
        
        // Initialize Azure Blob Service
        const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        const containerClient = blobServiceClient.getContainerClient(containerName);
        
        // Create container if it doesn't exist
        await containerClient.createIfNotExists({
            access: 'blob' // Public read access for blobs only
        });
        
        // Upload files to Azure Blob Storage
        const documentUrls = await uploadFilesToBlob(containerClient, parts);
        
        return {
            message: `Successfully uploaded ${documentUrls.length} document(s)`,
            data: {
                documentCount: documentUrls.length,
                documentUrls
            }
        };
        
    } catch (error) {
        context.log.error('Error uploading documents:', error);
        
        if (error instanceof ValidationError) {
            throw error;
        }
        
        throw new DatabaseError('Failed to upload documents to storage');
    }
}

// Helper function to validate file parts
function validateFileParts(parts) {
    const allowedTypes = [
        'application/pdf',
        'image/jpeg',
        'image/jpg', 
        'image/png',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    const maxFileSize = 10 * 1024 * 1024; // 10MB
    
    for (const part of parts) {
        // Check if file has a name
        if (!part.filename) {
            throw new ValidationError('All files must have a filename');
        }
        
        // Check file size
        if (part.data.length > maxFileSize) {
            throw new ValidationError(`File ${part.filename} exceeds maximum size of 10MB`);
        }
        
        // Check file type
        if (!allowedTypes.includes(part.type)) {
            throw new ValidationError(`File ${part.filename} has unsupported type: ${part.type}`);
        }
        
        // Check filename length
        if (part.filename.length > 255) {
            throw new ValidationError(`Filename ${part.filename} is too long`);
        }
    }
}

// Helper function to upload files to blob storage
async function uploadFilesToBlob(containerClient, parts) {
    const documentUrls = [];
    
    for (const part of parts) {
        try {
            // Generate a unique file name
            const fileExtension = part.filename.split('.').pop();
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const blobName = `${timestamp}-${uuidv4()}.${fileExtension}`;
            
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
                    fileSize: part.data.length.toString()
                }
            });
            
            // Get the URL
            const blobUrl = blockBlobClient.url;
            
            documentUrls.push({
                originalName: part.filename,
                url: blobUrl,
                contentType: part.type,
                size: part.data.length,
                blobName: blobName
            });
            
        } catch (uploadError) {
            throw new Error(`Failed to upload file ${part.filename}: ${uploadError.message}`);
        }
    }
    
    return documentUrls;
}

// Input validation function
function validateUploadDocumentsInput(req) {
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
module.exports = azureFunctionWrapper(uploadInvestorDocumentsHandler, {
    requireAuth: false, // Set to true if authentication is required
    validateInput: validateUploadDocumentsInput,
    enableCors: true,
    timeout: constants.TIMEOUTS.UPLOAD // 60 seconds for file upload
});