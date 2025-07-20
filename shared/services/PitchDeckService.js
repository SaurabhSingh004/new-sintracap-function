// shared/services/PitchDeckService.js
const CompanyProfile = require('../../models/sintracapFounder');
const { ValidationError } = require('../middleware/errorHandler');

class PitchDeckService {
    /**
     * Get all pitch deck documents for a founder
     * @param {string} founderId - The founder's ID
     * @returns {Promise<Array>} Array of pitch deck documents
     */
    static async getPitchDeckDocuments(founderId) {
        if (!founderId) {
            throw new ValidationError('Founder ID is required');
        }

        const founderProfile = await CompanyProfile.findById(founderId).select('pitchDeckDocuments');
        
        if (!founderProfile) {
            throw new ValidationError('Founder profile not found');
        }

        return founderProfile.pitchDeckDocuments || [];
    }

    /**
     * Get specific pitch deck documents by their IDs
     * @param {string} founderId - The founder's ID
     * @param {Array<string>} documentIds - Array of document IDs to retrieve
     * @returns {Promise<Array>} Array of matching pitch deck documents
     */
    static async getPitchDeckDocumentsByIds(founderId, documentIds) {
        if (!founderId) {
            throw new ValidationError('Founder ID is required');
        }

        if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
            throw new ValidationError('Document IDs array is required and cannot be empty');
        }

        const founderProfile = await CompanyProfile.findById(founderId).select('pitchDeckDocuments');
        
        if (!founderProfile) {
            throw new ValidationError('Founder profile not found');
        }

        const allDocuments = founderProfile.pitchDeckDocuments || [];
        
        // Filter documents by the provided IDs
        const matchingDocuments = allDocuments.filter(doc => 
            documentIds.includes(doc.documentId)
        );

        if (matchingDocuments.length === 0) {
            throw new ValidationError('No matching pitch deck documents found');
        }

        return matchingDocuments;
    }

    /**
     * Get verified pitch deck documents only
     * @param {string} founderId - The founder's ID
     * @returns {Promise<Array>} Array of verified pitch deck documents
     */
    static async getVerifiedPitchDeckDocuments(founderId) {
        if (!founderId) {
            throw new ValidationError('Founder ID is required');
        }

        const founderProfile = await CompanyProfile.findById(founderId).select('pitchDeckDocuments');
        
        if (!founderProfile) {
            throw new ValidationError('Founder profile not found');
        }

        const allDocuments = founderProfile.pitchDeckDocuments || [];
        
        // Filter only verified documents
        const verifiedDocuments = allDocuments.filter(doc => doc.isVerified === true);

        return verifiedDocuments;
    }

    /**
     * Get the most recent pitch deck documents
     * @param {string} founderId - The founder's ID
     * @param {number} limit - Maximum number of documents to return (default: 5)
     * @returns {Promise<Array>} Array of recent pitch deck documents
     */
    static async getRecentPitchDeckDocuments(founderId, limit = 5) {
        if (!founderId) {
            throw new ValidationError('Founder ID is required');
        }

        const founderProfile = await CompanyProfile.findById(founderId).select('pitchDeckDocuments');
        
        if (!founderProfile) {
            throw new ValidationError('Founder profile not found');
        }

        const allDocuments = founderProfile.pitchDeckDocuments || [];
        
        // Sort by uploadedAt in descending order and limit results
        const recentDocuments = allDocuments
            .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
            .slice(0, limit);

        return recentDocuments;
    }

    /**
     * Check if founder has any pitch deck documents
     * @param {string} founderId - The founder's ID
     * @returns {Promise<boolean>} True if founder has pitch deck documents
     */
    static async hasPitchDeckDocuments(founderId) {
        if (!founderId) {
            throw new ValidationError('Founder ID is required');
        }

        const founderProfile = await CompanyProfile.findById(founderId).select('pitchDeckDocuments');
        
        if (!founderProfile) {
            throw new ValidationError('Founder profile not found');
        }

        const documents = founderProfile.pitchDeckDocuments || [];
        return documents.length > 0;
    }

    /**
     * Get pitch deck document statistics
     * @param {string} founderId - The founder's ID
     * @returns {Promise<Object>} Statistics about pitch deck documents
     */
    static async getPitchDeckStatistics(founderId) {
        if (!founderId) {
            throw new ValidationError('Founder ID is required');
        }

        const founderProfile = await CompanyProfile.findById(founderId).select('pitchDeckDocuments');
        
        if (!founderProfile) {
            throw new ValidationError('Founder profile not found');
        }

        const documents = founderProfile.pitchDeckDocuments || [];
        
        const stats = {
            totalDocuments: documents.length,
            verifiedDocuments: documents.filter(doc => doc.isVerified === true).length,
            unverifiedDocuments: documents.filter(doc => doc.isVerified === false).length,
            mostRecentUpload: documents.length > 0 ? 
                Math.max(...documents.map(doc => new Date(doc.uploadedAt).getTime())) : null,
            oldestUpload: documents.length > 0 ? 
                Math.min(...documents.map(doc => new Date(doc.uploadedAt).getTime())) : null
        };

        return stats;
    }

    /**
     * Validate that specific document IDs exist for a founder
     * @param {string} founderId - The founder's ID
     * @param {Array<string>} documentIds - Array of document IDs to validate
     * @returns {Promise<Object>} Validation results
     */
    static async validateDocumentIds(founderId, documentIds) {
        if (!founderId) {
            throw new ValidationError('Founder ID is required');
        }

        if (!documentIds || !Array.isArray(documentIds)) {
            return { valid: false, missing: [], found: [] };
        }

        const founderProfile = await CompanyProfile.findById(founderId).select('pitchDeckDocuments');
        
        if (!founderProfile) {
            throw new ValidationError('Founder profile not found');
        }

        const allDocuments = founderProfile.pitchDeckDocuments || [];
        const existingDocumentIds = allDocuments.map(doc => doc.documentId);

        const found = documentIds.filter(id => existingDocumentIds.includes(id));
        const missing = documentIds.filter(id => !existingDocumentIds.includes(id));

        return {
            valid: missing.length === 0,
            found,
            missing,
            totalRequested: documentIds.length,
            totalFound: found.length
        };
    }

    /**
     * Get documents to send for investor emails
     * Priority: specified IDs > all verified > all available
     * @param {string} founderId - The founder's ID
     * @param {Array<string>} specifiedDocumentIds - Specific document IDs to send
     * @param {boolean} preferVerified - Whether to prefer verified documents
     * @returns {Promise<Array>} Array of documents to send
     */
    static async getDocumentsForInvestorEmail(founderId, specifiedDocumentIds = [], preferVerified = true) {
        if (!founderId) {
            throw new ValidationError('Founder ID is required');
        }

        let documentsToSend = [];

        // Priority 1: Use specified document IDs if provided
        if (specifiedDocumentIds && specifiedDocumentIds.length > 0) {
            try {
                documentsToSend = await this.getPitchDeckDocumentsByIds(founderId, specifiedDocumentIds);
            } catch (error) {
                // If specified IDs don't exist, continue to next priority
                console.warn(`Specified document IDs not found: ${error.message}`);
            }
        }

        // Priority 2: Use verified documents if preferred and no specified IDs worked
        if (documentsToSend.length === 0 && preferVerified) {
            try {
                documentsToSend = await this.getVerifiedPitchDeckDocuments(founderId);
            } catch (error) {
                console.warn(`Error getting verified documents: ${error.message}`);
            }
        }

        // Priority 3: Use all available documents if nothing else worked
        if (documentsToSend.length === 0) {
            try {
                documentsToSend = await this.getPitchDeckDocuments(founderId);
            } catch (error) {
                console.warn(`Error getting all documents: ${error.message}`);
            }
        }

        return documentsToSend;
    }
}

module.exports = PitchDeckService;