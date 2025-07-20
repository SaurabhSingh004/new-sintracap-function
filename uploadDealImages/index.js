const { 
    azureFunctionWrapper,
    ValidationError,
    DatabaseError,
    ensureDbConnection 
} = require('../shared/middleware/errorHandler');
const constants = require('../shared/config/constants');
const dbConfig = require('../shared/config/db.config');
const Deal = require('../models/deal'); // Assuming this is your Deal model
const authenticateToken = require('../shared/middleware/authenticateToken');
const UploadService = require('../shared/services/uploadService');
const DealImageValidator = require('../shared/validators/dealImageValidator');

// Main function handler
async function uploadDealImagesHandler(context, req) {
    // Ensure database connection
    await ensureDbConnection(dbConfig, context);
    
    // Authenticate user
    const authenticatedUser = await authenticateToken(context, req);
    if (!authenticatedUser) {
        return; // Response already set by authenticateToken middleware
    }
    
    // Get deal ID from params or body
    const dealId = req.params?.dealId;
    DealImageValidator.validateDealId(dealId);
    
    // Check if user has permission to upload images for this deal
    const deal = await Deal.findById(dealId);
    if (!deal) {
        throw new ValidationError('Deal not found');
    }
    
    // Check permissions (admin or deal creator)
    if (authenticatedUser.role !== 'admin' && deal.createdBy !== authenticatedUser._id.toString()) {
        throw new ValidationError('You do not have permission to upload images for this deal');
    }
    
    try {
        // Initialize upload service
        const uploadService = new UploadService();
        
        // Parse multipart data
        const parts = uploadService.parseMultipartData(req);
        
        // Validate files
        const validationOptions = DealImageValidator.getValidationOptions();
        uploadService.validateFiles(parts, validationOptions);
        
        // Check if adding these images would exceed the limit
        const currentImageCount = deal.dealMedias.filter(media => media.type === 'image').length;
        if (currentImageCount + parts.length > validationOptions.maxFiles) {
            throw new ValidationError(`Maximum ${validationOptions.maxFiles} images allowed per deal. Current: ${currentImageCount}, Trying to add: ${parts.length}`);
        }
        
        // Upload files to Azure Blob Storage
        const uploadOptions = {
            folderPath: `deals/${dealId}/images`,
            metadata: {
                dealId: dealId,
                uploadedBy: authenticatedUser._id.toString(),
                mediaType: 'deal-image'
            }
        };
        
        const uploadedImages = await uploadService.uploadFiles(parts, uploadOptions);
        
        // Prepare media objects for the deal
        const mediaObjects = uploadedImages.map(image => ({
            name: image.originalName,
            path: image.url,
            type: 'image',
            size: image.size,
            uploadedAt: new Date()
        }));
        
        // Update deal with new images
        await Deal.findByIdAndUpdate(
            dealId,
            {
                $push: {
                    dealMedias: { $each: mediaObjects }
                },
                $set: {
                    updatedAt: new Date()
                }
            },
            { new: true }
        );
        
        context.log(`Successfully uploaded ${uploadedImages.length} image(s) for deal ${dealId}`);
        
        return {
            message: `Successfully uploaded ${uploadedImages.length} image(s) to deal`,
            data: {
                dealId: dealId,
                imageCount: uploadedImages.length,
                images: mediaObjects,
                uploadedFiles: uploadedImages
            }
        };
        
    } catch (error) {
        context.log.error('Error uploading deal images:', error);
        
        if (error instanceof ValidationError) {
            throw error;
        }
        
        throw new DatabaseError('Failed to upload deal images to storage');
    }
}

// Export wrapped function
module.exports = azureFunctionWrapper(uploadDealImagesHandler, {
    requireAuth: true,
    validateInput: DealImageValidator.validateDealImageInput,
    enableCors: true,
    timeout: constants.TIMEOUTS.UPLOAD // 60 seconds for file upload
});
