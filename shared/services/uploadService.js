// services/uploadService.js
const { BlobServiceClient } = require('@azure/storage-blob');
const { v4: uuidv4 } = require('uuid');
const multipart = require('parse-multipart');
const { ValidationError } = require('../middleware/errorHandler');

class UploadService {
    constructor() {
        this.connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING || 
            "DefaultEndpointsProtocol=https;AccountName=sintracap;AccountKey=kGfGEuu7WUkWUkqXkvdceqzbTjI0a/dI+oEyboCIZDDkBdOtFo60E38hGLKnEzM8AB8Ww2qxi7UZ+AStrcDDHw==;EndpointSuffix=core.windows.net";
        this.containerName = process.env.AZURE_CONTAINER_NAME || 'sintracap-media';
        this.blobServiceClient = BlobServiceClient.fromConnectionString(this.connectionString);
        this.containerClient = this.blobServiceClient.getContainerClient(this.containerName);
    }

    // Initialize container
    async initializeContainer() {
        await this.containerClient.createIfNotExists({
            access: 'blob' // Public read access for blobs only
        });
    }

    // Parse multipart form data
    parseMultipartData(req) {
        if (!req.body || !req.headers['content-type']) {
            throw new ValidationError('Request body or content-type missing');
        }
        
        if (!req.headers['content-type'].includes('multipart')) {
            throw new ValidationError('Content-Type must be multipart/form-data');
        }

        const bodyBuffer = Buffer.from(req.body);
        const boundary = multipart.getBoundary(req.headers['content-type']);
        const parts = multipart.Parse(bodyBuffer, boundary);
        
        if (!parts || parts.length === 0) {
            throw new ValidationError('No files found in the request');
        }

        return parts;
    }

    // Generic file validation
    validateFiles(parts, options = {}) {
        const {
            allowedTypes = [],
            maxFileSize = 10 * 1024 * 1024, // 10MB default
            maxFiles = 10,
            requiredKeywords = [],
            filePrefix = 'file'
        } = options;

        if (parts.length > maxFiles) {
            throw new ValidationError(`Maximum ${maxFiles} files allowed`);
        }

        for (const part of parts) {
            // Check if file has a name
            if (!part.filename) {
                throw new ValidationError('All files must have a filename');
            }
            
            // Check file size
            if (part.data.length > maxFileSize) {
                const sizeMB = Math.round(maxFileSize / (1024 * 1024));
                throw new ValidationError(`File ${part.filename} exceeds maximum size of ${sizeMB}MB`);
            }
            
            // Check file type
            if (allowedTypes.length > 0 && !allowedTypes.includes(part.type)) {
                throw new ValidationError(`File ${part.filename} has unsupported type: ${part.type}. Allowed types: ${allowedTypes.join(', ')}`);
            }
            
            // Check filename length
            if (part.filename.length > 255) {
                throw new ValidationError(`Filename ${part.filename} is too long`);
            }
            
            // Check for required keywords (optional)
            if (requiredKeywords.length > 0) {
                const filename = part.filename.toLowerCase();
                const hasRequiredKeyword = requiredKeywords.some(keyword => 
                    filename.includes(keyword.toLowerCase())
                );
                
                if (!hasRequiredKeyword) {
                    throw new ValidationError(`File ${part.filename} doesn't contain required keywords: ${requiredKeywords.join(', ')}`);
                }
            }
        }
    }

    // Upload files to blob storage
    async uploadFiles(parts, options = {}) {
        const {
            folderPath = 'general',
            metadata = {},
            filePrefix = 'file'
        } = options;

        await this.initializeContainer();
        
        const uploadedFiles = [];
        
        for (const part of parts) {
            try {
                // Generate a unique file name
                const fileExtension = part.filename.split('.').pop();
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const fileId = uuidv4();
                const blobName = `${folderPath}/${timestamp}-${fileId}.${fileExtension}`;
                
                // Upload to Azure Blob Storage
                const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
                
                await blockBlobClient.upload(part.data, part.data.length, {
                    blobHTTPHeaders: {
                        blobContentType: part.type,
                        blobContentDisposition: `attachment; filename="${part.filename}"`
                    },
                    metadata: {
                        originalName: part.filename,
                        uploadDate: new Date().toISOString(),
                        fileSize: part.data.length.toString(),
                        fileId: fileId,
                        ...metadata
                    }
                });
                
                // Get the URL
                const blobUrl = blockBlobClient.url;
                
                uploadedFiles.push({
                    fileId: fileId,
                    originalName: part.filename,
                    url: blobUrl,
                    type: this.getMediaType(part.type),
                    contentType: part.type,
                    size: part.data.length,
                    blobName: blobName,
                    path: blobUrl // For compatibility with Deal schema
                });
                
            } catch (uploadError) {
                throw new Error(`Failed to upload file ${part.filename}: ${uploadError.message}`);
            }
        }
        
        return uploadedFiles;
    }

    // Helper to determine media type
    getMediaType(contentType) {
        if (contentType.startsWith('image/')) return 'image';
        if (contentType.startsWith('video/')) return 'video';
        return 'document';
    }

    // Delete file from blob storage
    async deleteFile(blobName) {
        try {
            const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
            await blockBlobClient.delete();
            return true;
        } catch (error) {
            console.error(`Failed to delete file ${blobName}:`, error);
            return false;
        }
    }
}

module.exports = UploadService;