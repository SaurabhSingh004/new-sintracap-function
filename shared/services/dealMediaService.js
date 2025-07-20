
// services/dealMediaService.js (Additional service for deal media management)
const Deal = require('../../models/deal');
const UploadService = require('./uploadService');
const { ValidationError, DatabaseError } = require('../middleware/errorHandler');

class DealMediaService {
    constructor() {
        this.uploadService = new UploadService();
    }

    // Get all media for a deal
    async getDealMedia(dealId, mediaType = null) {
        const deal = await Deal.findById(dealId);
        if (!deal) {
            throw new ValidationError('Deal not found');
        }

        let media = deal.dealMedias;
        if (mediaType) {
            media = media.filter(m => m.type === mediaType);
        }

        return media;
    }

    // Delete media from deal
    async deleteDealMedia(dealId, mediaId, userId, userRole) {
        const deal = await Deal.findById(dealId);
        if (!deal) {
            throw new ValidationError('Deal not found');
        }
        // Check permissions
        if (userRole !== 'admin' && deal.createdBy !== userId) {
            throw new ValidationError('You do not have permission to delete media from this deal');
        }

        const mediaItem = deal.dealMedias.id(mediaId);
        if (!mediaItem) {
            throw new ValidationError('Media not found');
        }

        // Extract blob name from URL to delete from storage
        const url = mediaItem.path;
        const blobName = this.extractBlobNameFromUrl(url);
        
        // Delete from Azure Storage
        if (blobName) {
            await this.uploadService.deleteFile(blobName);
        }

        // Remove from deal
        await Deal.findByIdAndUpdate(
            dealId,
            {
                $pull: { dealMedias: { _id: mediaId } },
                $set: { updatedAt: new Date() }
            }
        );

        return { message: 'Media deleted successfully' };
    }

    // Helper to extract blob name from URL
    extractBlobNameFromUrl(url) {
        try {
            const urlObj = new URL(url);
            const pathParts = urlObj.pathname.split('/');
            // Remove the first element (empty string) and container name
            pathParts.shift(); // Remove empty string
            pathParts.shift(); // Remove container name
            return pathParts.join('/');
        } catch (error) {
            console.error('Failed to extract blob name from URL:', url, error);
            return null;
        }
    }

    // Bulk upload different types of media
    async uploadDealMedia(dealId, files, mediaType, userId, userRole) {
        const deal = await Deal.findById(dealId);
        if (!deal) {
            throw new ValidationError('Deal not found');
        }

        // Check permissions
        if (userRole !== 'admin' && deal.createdBy !== userId) {
            throw new ValidationError('You do not have permission to upload media to this deal');
        }

        let validationOptions;
        switch (mediaType) {
            case 'image':
                validationOptions = {
                    allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
                    maxFileSize: 5 * 1024 * 1024, // 5MB
                    maxFiles: 5
                };
                break;
            case 'video':
                validationOptions = {
                    allowedTypes: ['video/mp4', 'video/webm', 'video/ogg'],
                    maxFileSize: 50 * 1024 * 1024, // 50MB
                    maxFiles: 3
                };
                break;
            case 'document':
                validationOptions = {
                    allowedTypes: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
                    maxFileSize: 10 * 1024 * 1024, // 10MB
                    maxFiles: 10
                };
                break;
            default:
                throw new ValidationError('Invalid media type. Allowed: image, video, document');
        }

        this.uploadService.validateFiles(files, validationOptions);

        const uploadOptions = {
            folderPath: `deals/${dealId}/${mediaType}s`,
            metadata: {
                dealId: dealId,
                uploadedBy: userId,
                mediaType: `deal-${mediaType}`
            }
        };

        const uploadedFiles = await this.uploadService.uploadFiles(files, uploadOptions);

        const mediaObjects = uploadedFiles.map(file => ({
            name: file.originalName,
            path: file.url,
            type: mediaType,
            size: file.size,
            uploadedAt: new Date()
        }));

        await Deal.findByIdAndUpdate(
            dealId,
            {
                $push: { dealMedias: { $each: mediaObjects } },
                $set: { updatedAt: new Date() }
            },
            { new: true }
        );

        return {
            message: `Successfully uploaded ${uploadedFiles.length} ${mediaType}(s)`,
            data: {
                dealId: dealId,
                mediaCount: uploadedFiles.length,
                media: mediaObjects
            }
        };
    }
}

module.exports = DealMediaService;