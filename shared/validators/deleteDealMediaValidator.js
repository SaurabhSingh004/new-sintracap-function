const { ValidationError } = require('../middleware/errorHandler');

class DealMediaDeleteValidator {
    // Validate deal ID format
    static validateDealId(dealId) {
        if (!dealId) {
            throw new ValidationError('Deal ID is required');
        }
        
        if (!/^[0-9a-fA-F]{24}$/.test(dealId)) {
            throw new ValidationError('Invalid Deal ID format');
        }
    }

    // Validate media ID format
    static validateMediaId(mediaId) {
        if (!mediaId) {
            throw new ValidationError('Media ID is required');
        }
        
        if (!/^[0-9a-fA-F]{24}$/.test(mediaId)) {
            throw new ValidationError('Invalid Media ID format');
        }
    }

    // Validate request input structure
    static validateRequestInput(req) {
        const dealId = req.params?.dealId;
        const mediaId = req.params?.mediaId;
        
        if (!dealId) {
            throw new ValidationError('Deal ID is required in the URL path');
        }
        
        if (!mediaId) {
            throw new ValidationError('Media ID is required in the URL path');
        }
    }

    // Complete validation for deletion request
    static validateDeletionRequest(req) {
        const dealId = req.params?.dealId;
        const mediaId = req.params?.mediaId;
        
        this.validateDealId(dealId);
        this.validateMediaId(mediaId);
        
        return { dealId, mediaId };
    }

    // Validate media type (optional filter)
    static validateMediaType(mediaType) {
        const allowedTypes = ['image', 'video', 'document'];
        
        if (mediaType && !allowedTypes.includes(mediaType)) {
            throw new ValidationError(`Invalid media type. Allowed types: ${allowedTypes.join(', ')}`);
        }
    }
}

module.exports = DealMediaDeleteValidator;