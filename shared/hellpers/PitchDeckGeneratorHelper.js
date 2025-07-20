// shared/helpers/PitchDeckGeneratorHelper.js
const { BlobServiceClient } = require('@azure/storage-blob');
const axios = require('axios');
const FormData = require('form-data');
const { v4: uuidv4 } = require('uuid');
const { ValidationError } = require('../middleware/errorHandler');
const CompanyProfile = require('../../models/sintracapFounder');

class PitchDeckGeneratorHelper {
    static PITCH_DECK_API_BASE = 'https://pitchdeck.happytree-df551ac3.southindia.azurecontainerapps.io/api';
    static AZURE_CONTAINER_NAME = 'generated-pitch-decks';
    
    /**
     * Get Azure Blob Service Client with better error handling
     * @returns {Object} Azure Blob Service Client
     */
    static getBlobServiceClient() {
        const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING || 
            "DefaultEndpointsProtocol=https;AccountName=sintracap;AccountKey=kGfGEuu7WUkWUkqXkvdceqzbTjI0a/dI+oEyboCIZDDkBdOtFo60E38hGLKnEzM8AB8Ww2qxi7UZ+AStrcDDHw==;EndpointSuffix=core.windows.net";
        
        if (!connectionString) {
            throw new Error('Azure Storage connection string is not configured');
        }
        
        try {
            return BlobServiceClient.fromConnectionString(connectionString);
        } catch (error) {
            throw new Error(`Failed to create blob service client: ${error.message}`);
        }
    }

    /**
     * Download document from Azure Blob Storage with retry mechanism
     * @param {string} documentUrl - The blob URL
     * @param {number} maxRetries - Maximum number of retry attempts
     * @returns {Promise<Buffer>} Document buffer
     */
    static async downloadDocumentFromBlob(documentUrl, maxRetries = 3) {
        if (!documentUrl) {
            throw new Error('Document URL is required');
        }

        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const blobServiceClient = this.getBlobServiceClient();
                const url = new URL(documentUrl);
                const pathParts = url.pathname.split('/').filter(part => part.length > 0);
                
                if (pathParts.length < 2) {
                    throw new Error('Invalid blob URL format');
                }
                
                const containerName = pathParts[0];
                const blobName = pathParts.slice(1).join('/');
                
                const containerClient = blobServiceClient.getContainerClient(containerName);
                const blobClient = containerClient.getBlobClient(blobName);
                
                // Check if blob exists
                const exists = await blobClient.exists();
                if (!exists) {
                    throw new Error(`Blob does not exist: ${blobName}`);
                }
                
                const downloadResponse = await blobClient.download();
                
                if (!downloadResponse.readableStreamBody) {
                    throw new Error('No readable stream returned from blob download');
                }
                
                const chunks = [];
                for await (const chunk of downloadResponse.readableStreamBody) {
                    chunks.push(chunk);
                }
                
                const buffer = Buffer.concat(chunks);
                console.log(`Downloaded ${buffer.length} bytes from blob: ${blobName}`);
                console.log("buffer", buffer);
                if (buffer.length === 0) {
                    throw new Error('Downloaded document is empty');
                }
                
                return buffer;
                
            } catch (error) {
                lastError = error;
                console.log(`Download attempt ${attempt} failed: ${error.message}`);
                
                if (attempt < maxRetries) {
                    // Wait before retry (exponential backoff)
                    await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
                }
            }
        }
        
        throw new Error(`Failed to download document after ${maxRetries} attempts: ${lastError.message}`);
    }

    /**
     * Upload document to external pitch deck API
     * @param {Buffer} documentBuffer - Document buffer
     * @param {string} filename - Original filename
     * @param {string} userId - User ID
     * @param {Object} context - Azure function context
     * @returns {Promise<Object>} Upload response
     */
    static async uploadDocumentToAPI(documentBuffer, filename, userId, context) {
        console.log('Uploading document to external pitch deck API...');
        console.log(`Filename: ${filename}`);
        console.log(`User ID: ${userId}`);
        if (!documentBuffer || !Buffer.isBuffer(documentBuffer)) {
            throw new Error('Valid document buffer is required');
        }
        
        if (!filename || typeof filename !== 'string') {
            throw new Error('Valid filename is required');
        }
        
        if (!userId || typeof userId !== 'string') {
            throw new Error('Valid user ID is required');
        }

        try {
            const formData = new FormData();
            formData.append('file', documentBuffer, {
                filename: filename,
                contentType: 'application/pdf'
            });

            const uploadUrl = `${this.PITCH_DECK_API_BASE}/documents/upload`;
            const params = new URLSearchParams({
                document_type: 'pdf',
                user_id: userId
            });

            context.log(`Uploading document to API: ${uploadUrl}?${params.toString()}`);

            const response = await axios.post(`${uploadUrl}?${params.toString()}`, formData, {
                headers: {
                    ...formData.getHeaders(),
                    'accept': 'application/json'
                },
                timeout: 60000, // 60 seconds timeout
                maxBodyLength: Infinity,
                maxContentLength: Infinity
            });

            context.log('Document upload successful:', response.data);
            return response.data;

        } catch (error) {
            const errorMsg = error.response?.data?.message || error.message;
            context.log.error('Failed to upload document to API:', errorMsg);
            throw new Error(`Document upload failed: ${errorMsg}`);
        }
    }

    /**
     * Generate pitch deck using external API
     * @param {string} companyName - Company name
     * @param {string} userId - User ID
     * @param {string} theme - Theme (default: light)
     * @param {Object} context - Azure function context
     * @returns {Promise<Object>} Generation response
     */
    static async generatePitchDeck(companyName, userId, theme = 'light', context) {
        if (!companyName || typeof companyName !== 'string') {
            throw new Error('Valid company name is required');
        }
        
        if (!userId || typeof userId !== 'string') {
            throw new Error('Valid user ID is required');
        }

        try {
            const generateUrl = `${this.PITCH_DECK_API_BASE}/pitch/generate`;
            const requestData = {
                company_name: companyName,
                theme: theme,
                user_id: userId
            };

            context.log(`Generating pitch deck for company: ${companyName}`);
            context.log('Request data:', requestData);

            const response = await axios.post(generateUrl, requestData, {
                headers: {
                    'accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                timeout: 300000, // 5 minutes timeout to handle the 2+ minute generation time
            });

            context.log('Pitch deck generation successful:', response.data);
            return response.data;

        } catch (error) {
            const errorMsg = error.response?.data?.message || error.message;
            context.log.error('Failed to generate pitch deck:', errorMsg);
            
            if (error.code === 'ECONNABORTED') {
                throw new Error('Pitch deck generation timed out. The process may still be running.');
            }
            
            throw new Error(`Pitch deck generation failed: ${errorMsg}`);
        }
    }

    /**
     * Download generated pitch deck file
     * @param {string} userId - User ID
     * @param {string} filename - Filename from generation response
     * @param {Object} context - Azure function context
     * @returns {Promise<Buffer>} File buffer
     */
    static async downloadGeneratedPitchDeck(userId, filename, context) {
        if (!userId || typeof userId !== 'string') {
            throw new Error('Valid user ID is required');
        }
        
        if (!filename || typeof filename !== 'string') {
            throw new Error('Valid filename is required');
        }

        try {
            const downloadUrl = `${this.PITCH_DECK_API_BASE}/pitch/download/${userId}/${filename}`;
            
            context.log(`Downloading generated pitch deck: ${downloadUrl}`);

            const response = await axios.get(downloadUrl, {
                headers: {
                    'accept': 'application/json'
                },
                responseType: 'arraybuffer', // Important: get raw data as buffer
                timeout: 60000, // 60 seconds timeout
            });

            const buffer = Buffer.from(response.data);
            
            if (buffer.length === 0) {
                throw new Error('Downloaded file is empty');
            }

            context.log(`Successfully downloaded pitch deck: ${buffer.length} bytes`);
            return buffer;

        } catch (error) {
            const errorMsg = error.response?.data?.message || error.message;
            context.log.error('Failed to download generated pitch deck:', errorMsg);
            throw new Error(`Pitch deck download failed: ${errorMsg}`);
        }
    }

    /**
     * Upload generated pitch deck to Azure Blob Storage
     * @param {Buffer} fileBuffer - File buffer
     * @param {string} originalFilename - Original filename
     * @param {string} founderId - Founder ID
     * @param {Object} context - Azure function context
     * @returns {Promise<Object>} Upload result with URL
     */
    static async uploadToAzureStorage(fileBuffer, originalFilename, founderId, context) {
        if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
            throw new Error('Valid file buffer is required');
        }
        
        if (!originalFilename || typeof originalFilename !== 'string') {
            throw new Error('Valid filename is required');
        }
        
        if (!founderId || typeof founderId !== 'string') {
            throw new Error('Valid founder ID is required');
        }

        try {
            const blobServiceClient = this.getBlobServiceClient();
            const containerClient = blobServiceClient.getContainerClient(this.AZURE_CONTAINER_NAME);
            
            // Create container if it doesn't exist
            await containerClient.createIfNotExists({
                access: 'blob' // Public read access for blobs only
            });

            // Generate unique blob name
            const fileExtension = originalFilename.split('.').pop() || 'pptx';
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const blobName = `${founderId}/${timestamp}-${uuidv4()}.${fileExtension}`;

            // Upload to Azure Blob Storage
            const blockBlobClient = containerClient.getBlockBlobClient(blobName);
            
            await blockBlobClient.upload(fileBuffer, fileBuffer.length, {
                blobHTTPHeaders: {
                    blobContentType: 'application/vnd.openxmlformats-presentationml.presentation',
                    blobContentDisposition: `attachment; filename="${originalFilename}"`
                },
                metadata: {
                    originalName: originalFilename,
                    founderId: founderId,
                    uploadDate: new Date().toISOString(),
                    fileSize: fileBuffer.length.toString(),
                    generatedBy: 'pitch-deck-api'
                }
            });

            const blobUrl = blockBlobClient.url;
            
            context.log(`Successfully uploaded to Azure Storage: ${blobUrl}`);
            
            return {
                url: blobUrl,
                blobName: blobName,
                originalName: originalFilename,
                size: fileBuffer.length,
                contentType: 'application/vnd.openxmlformats-presentationml.presentation'
            };

        } catch (error) {
            context.log.error('Failed to upload to Azure Storage:', error);
            throw new Error(`Azure Storage upload failed: ${error.message}`);
        }
    }

    /**
     * Extract filename from file URL path
     * @param {string} fileUrl - File URL from API response
     * @returns {string} Extracted filename
     */
    static extractFilenameFromUrl(fileUrl) {
        if (!fileUrl || typeof fileUrl !== 'string') {
            throw new Error('Valid file URL is required');
        }

        try {
            // Remove leading slash if present
            const cleanUrl = fileUrl.startsWith('/') ? fileUrl.substring(1) : fileUrl;
            
            // Split by '/' and get the last part (filename)
            const parts = cleanUrl.split('/');
            const filename = parts[parts.length - 1];
            
            if (!filename) {
                throw new Error('Could not extract filename from URL');
            }
            
            return filename;
        } catch (error) {
            throw new Error(`Failed to extract filename from URL: ${error.message}`);
        }
    }

    /**
     * Update founder profile with generated pitch deck document
     * @param {string} founderId - Founder ID
     * @param {Object} uploadResult - Result from Azure upload
     * @param {Object} context - Azure function context
     * @returns {Promise<Object>} Updated founder profile
     */
    static async updateFounderPitchDeckDocuments(founderId, uploadResult, context) {
        try {
            const founder = await CompanyProfile.findById(founderId);
            
            if (!founder) {
                throw new Error('Founder profile not found');
            }

            // Initialize pitchDeckDocuments array if it doesn't exist
            if (!founder.pitchDeckDocuments) {
                founder.pitchDeckDocuments = [];
            }

            // Create new document entry according to schema
            const newDocument = {
                documentId: uuidv4(),
                name: uploadResult.originalName,
                url: uploadResult.url,
                uploadedAt: new Date(),
                isVerified: false // Default as per schema
            };

            // Add to pitchDeckDocuments array
            founder.pitchDeckDocuments.push(newDocument);
            
            // Save the updated founder profile
            const updatedFounder = await founder.save();
            
            context.log(`Updated founder profile with new pitch deck document: ${newDocument.documentId}`);
            context.log(`Document URL saved: ${newDocument.url}`);
            
            return {
                founder: updatedFounder,
                newDocument: newDocument
            };

        } catch (error) {
            context.log.error('Failed to update founder profile:', error);
            throw new Error(`Failed to update founder profile: ${error.message}`);
        }
    }

    /**
     * Get all pitch deck documents for a founder
     * @param {string} founderId - Founder ID
     * @param {Object} context - Azure function context
     * @returns {Promise<Array>} Array of pitch deck documents
     */
    static async getFounderPitchDeckDocuments(founderId, context) {
        try {
            const founder = await CompanyProfile.findById(founderId).select('pitchDeckDocuments companyName');
            
            if (!founder) {
                throw new Error('Founder profile not found');
            }

            context.log(`Retrieved ${founder.pitchDeckDocuments?.length || 0} pitch deck documents for founder: ${founderId}`);
            
            return {
                companyName: founder.companyName,
                documents: founder.pitchDeckDocuments || []
            };

        } catch (error) {
            context.log.error('Failed to get founder pitch deck documents:', error);
            throw new Error(`Failed to get pitch deck documents: ${error.message}`);
        }
    }

    /**
     * Mark a pitch deck document as verified
     * @param {string} founderId - Founder ID
     * @param {string} documentId - Document ID to verify
     * @param {Object} context - Azure function context
     * @returns {Promise<Object>} Updated document
     */
    static async markPitchDeckDocumentAsVerified(founderId, documentId, context) {
        try {
            const founder = await CompanyProfile.findById(founderId);
            
            if (!founder) {
                throw new Error('Founder profile not found');
            }

            const document = founder.pitchDeckDocuments?.find(doc => doc.documentId === documentId);
            
            if (!document) {
                throw new Error('Pitch deck document not found');
            }

            // Update the document's verification status
            document.isVerified = true;
            
            // Save the updated founder profile
            const updatedFounder = await founder.save();
            
            context.log(`Marked pitch deck document as verified: ${documentId}`);
            
            return {
                success: true,
                document: document,
                founder: updatedFounder
            };

        } catch (error) {
            context.log.error('Failed to mark document as verified:', error);
            throw new Error(`Failed to verify document: ${error.message}`);
        }
    }

    /**
     * Delete a pitch deck document
     * @param {string} founderId - Founder ID
     * @param {string} documentId - Document ID to delete
     * @param {boolean} deleteFromStorage - Whether to also delete from Azure Storage
     * @param {Object} context - Azure function context
     * @returns {Promise<Object>} Deletion result
     */
    static async deletePitchDeckDocument(founderId, documentId, deleteFromStorage = true, context) {
        try {
            const founder = await CompanyProfile.findById(founderId);
            
            if (!founder) {
                throw new Error('Founder profile not found');
            }

            const documentIndex = founder.pitchDeckDocuments?.findIndex(doc => doc.documentId === documentId);
            
            if (documentIndex === -1) {
                throw new Error('Pitch deck document not found');
            }

            const document = founder.pitchDeckDocuments[documentIndex];
            
            // Remove from Azure Storage if requested
            if (deleteFromStorage && document.url) {
                try {
                    await this.deleteDocumentFromBlob(document.url, context);
                    context.log(`Deleted document from Azure Storage: ${document.url}`);
                } catch (storageError) {
                    context.log.warn(`Failed to delete from storage: ${storageError.message}`);
                    // Continue with database deletion even if storage deletion fails
                }
            }

            // Remove from database
            founder.pitchDeckDocuments.splice(documentIndex, 1);
            
            // Save the updated founder profile
            const updatedFounder = await founder.save();
            
            context.log(`Deleted pitch deck document: ${documentId}`);
            
            return {
                success: true,
                deletedDocument: document,
                founder: updatedFounder
            };

        } catch (error) {
            context.log.error('Failed to delete pitch deck document:', error);
            throw new Error(`Failed to delete document: ${error.message}`);
        }
    }

    /**
     * Delete document from Azure Blob Storage
     * @param {string} documentUrl - Document URL to delete
     * @param {Object} context - Azure function context
     * @returns {Promise<void>}
     */
    static async deleteDocumentFromBlob(documentUrl, context) {
        if (!documentUrl) {
            throw new Error('Document URL is required');
        }

        try {
            const blobServiceClient = this.getBlobServiceClient();
            const url = new URL(documentUrl);
            const pathParts = url.pathname.split('/').filter(part => part.length > 0);
            
            if (pathParts.length < 2) {
                throw new Error('Invalid blob URL format');
            }
            
            const containerName = pathParts[0];
            const blobName = pathParts.slice(1).join('/');
            
            const containerClient = blobServiceClient.getContainerClient(containerName);
            const blobClient = containerClient.getBlobClient(blobName);
            
            // Check if blob exists before attempting deletion
            const exists = await blobClient.exists();
            if (!exists) {
                context.log.warn(`Blob does not exist: ${blobName}`);
                return;
            }
            
            await blobClient.delete();
            context.log(`Successfully deleted blob: ${blobName}`);
            
        } catch (error) {
            context.log.error(`Failed to delete blob: ${error.message}`);
            throw new Error(`Blob deletion failed: ${error.message}`);
        }
    }

    /**
     * Main function to orchestrate the complete pitch deck generation process
     * @param {Object} params - Parameters object
     * @param {string} params.founderId - Founder ID
     * @param {string} params.documentUrl - URL of the source document
     * @param {string} params.userId - External API user ID
     * @param {string} params.theme - Presentation theme (default: light)
     * @param {Object} params.context - Azure function context
     * @returns {Promise<Object>} Complete generation result
     */
    static async generatePitchDeckFromDocument({
        founderId,
        theme = 'light',
        context
    }) {
        // Validate required parameters
        if (!founderId) {
            throw new ValidationError('Founder ID is required');
        }
    
        if (!context || typeof context.log !== 'function') {
            throw new ValidationError('Valid Azure function context is required');
        }

        try {
            context.log(`Starting pitch deck generation process for founder: ${founderId}`);
            
            // Step 1: Get founder profile
            const founder = await CompanyProfile.findOne({ _id: founderId })
                .select('companyName industry sector website email pitchDeckDocuments');
            if (!founder) {
                throw new Error('Founder profile not found');
            }
            context.log(`Found founder profile: ${founder.pitchDeckDocuments?.length || 0} documents found`);
            const companyName = founder.companyName || 'Company';
            context.log(`Company name: ${companyName}`);
            const documentUrl = founder.pitchDeckDocuments?.[0]?.url;
            context.log(`Document URL: ${documentUrl}`);
            // Step 2: Download document from Azure Blob Storage
            context.log('Step 1: Downloading document from Azure Blob Storage...');
            const documentBuffer = await this.downloadDocumentFromBlob(documentUrl);
            
            // Extract filename from URL for upload
            const url = new URL(documentUrl);
            const pathParts = url.pathname.split('/');
            const originalFilename = pathParts[pathParts.length - 1] || 'document.pdf';

            // Step 3: Upload document to external API
            context.log('Step 2: Uploading document to pitch deck API...');
            const uploadResponse = await this.uploadDocumentToAPI(documentBuffer, originalFilename, founderId, context);

            // Step 4: Generate pitch deck
            context.log('Step 3: Generating pitch deck...');
            const generationResponse = await this.generatePitchDeck(companyName, founderId, theme, context);

            if (!generationResponse.file_url) {
                throw new Error('No file URL in generation response');
            }

            // Step 5: Extract filename and download generated file
            context.log('Step 4: Downloading generated pitch deck...');
            const filename = this.extractFilenameFromUrl(generationResponse.file_url);
            const generatedFileBuffer = await this.downloadGeneratedPitchDeck(founderId, filename, context);

            // Step 6: Upload generated file to Azure Storage
            context.log('Step 5: Uploading generated pitch deck to Azure Storage...');
            const azureUploadResult = await this.uploadToAzureStorage(generatedFileBuffer, filename, founderId, context);

            // Step 7: Update founder profile
            context.log('Step 6: Updating founder profile...');
            const profileUpdateResult = await this.updateFounderPitchDeckDocuments(founderId, azureUploadResult, context);

            context.log('Pitch deck generation process completed successfully!');

            return {
                success: true,
                message: 'Pitch deck generated and uploaded successfully',
                data: {
                    originalDocument: {
                        url: documentUrl,
                        filename: originalFilename
                    },
                    generatedPitchDeck: {
                        url: azureUploadResult.url,
                        filename: filename,
                        size: azureUploadResult.size,
                        documentId: profileUpdateResult.newDocument.documentId
                    },
                    generationDetails: {
                        sectionsGenerated: generationResponse.sections_generated || [],
                        theme: theme,
                        companyName: companyName
                    },
                    uploadResponse: uploadResponse,
                    generationResponse: generationResponse
                }
            };

        } catch (error) {
            context.log.error('Error in pitch deck generation process:', error);
            throw new Error(`Pitch deck generation failed: ${error.message}`);
        }
    }

    /**
     * Health check method to validate service dependencies
     * @param {Object} context - Azure function context
     * @returns {Promise<Object>} Health check results
     */
    static async healthCheck(context) {
        const results = {
            azureStorage: false,
            externalAPI: false,
            database: false,
            errors: []
        };

        try {
            // Check Azure Storage
            const blobServiceClient = this.getBlobServiceClient();
            await blobServiceClient.getAccountInfo();
            results.azureStorage = true;
        } catch (error) {
            results.errors.push(`Azure Storage: ${error.message}`);
        }

        try {
            // Check database connection
            await CompanyProfile.findOne().limit(1);
            results.database = true;
        } catch (error) {
            results.errors.push(`Database: ${error.message}`);
        }

        try {
            // Check external API (simple ping - you might want to implement a health endpoint)
            const response = await axios.get(`${this.PITCH_DECK_API_BASE}/health`, {
                timeout: 5000,
                validateStatus: () => true // Accept any status for health check
            });
            results.externalAPI = response.status < 500;
        } catch (error) {
            results.errors.push(`External API: ${error.message}`);
        }

        const isHealthy = results.azureStorage && results.database && results.externalAPI;
        
        if (context) {
            context.log('Health check completed:', { isHealthy, results });
        }

        return { isHealthy, results };
    }
}

module.exports = PitchDeckGeneratorHelper;