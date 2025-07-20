const { ValidationError } = require('../middleware/errorHandler');

class DealImageValidator {
    static getValidationOptions() {
        return {
            allowedTypes: [
                'image/jpeg',
                'image/jpg', 
                'image/png',
                'image/webp',
                'image/gif'
            ],
            maxFileSize: 5 * 1024 * 1024, // 5MB for images
            maxFiles: 5, // Maximum 5 images per deal
            requiredKeywords: [], // No required keywords for deal images
            filePrefix: 'deal-image'
        };
    }

    static validateDealImageInput(req) {
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

    static validateDealId(dealId) {
        if (!dealId) {
            throw new ValidationError('Deal ID is required');
        }
        
        // Basic MongoDB ObjectId validation
        if (!/^[0-9a-fA-F]{24}$/.test(dealId)) {
            throw new ValidationError('Invalid Deal ID format');
        }
    }
}

module.exports = DealImageValidator;