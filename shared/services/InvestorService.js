const InvestorProfile = require('../../models/sintracapInvestor');
const mongoose = require('mongoose');

class InvestorService {
    static async validateInvestorIds(investorIds) {
        if (!Array.isArray(investorIds) || investorIds.length === 0) {
            return { found: [], missing: [] };
        }

        // Find all docs whose _id is in the list
        const docs = await InvestorProfile
            .find({ _id: { $in: investorIds } })
            .select('_id')
            .lean();

        const found = docs.map(d => d._id.toString());
        const missing = investorIds.filter(id => !found.includes(id));

        return { found, missing };
    }

    /**
     * Get investor emails from investor IDs
     * @param {Array} investorIds - Array of investor ID strings
     * @returns {Array} - Array of {id, email, fullName} objects
     */
    static async getInvestorEmailsFromIds(investorIds) {
        console.log('getInvestorEmailsFromIds called with:', investorIds);
        if (!investorIds || !Array.isArray(investorIds) || investorIds.length === 0) {
            return [];
        }
        console.log('Fetching investor emails for IDs:', investorIds);
        const investors = await InvestorProfile.find({
            _id: { $in: investorIds },
            email: { $exists: true, $ne: null, $ne: '' },
            emailVerified: true
        }).select('_id email fullName');
        console.log('Found investors:', investors);
        return investors.map(investor => ({
            id: investor._id.toString(),
            email: investor.email,
            fullName: investor.fullName
        }));
    }

    /**
     * Record contact history for investors
     * @param {Array} investorIds - Array of investor ID strings
     * @param {String} contactType - Type of contact
     * @param {String} message - Message content
     * @param {String} fundingRequestId - Related funding request ID
     * @param {String} sentById - ID of user who sent the contact
     */
    static async recordContactHistory(investorIds, contactType, message, fundingRequestId, sentById) {
        if (!investorIds || investorIds.length === 0) return;

        const objectIds = investorIds
            .filter(id => mongoose.Types.ObjectId.isValid(id))
            .map(id => new mongoose.Types.ObjectId(id));

        await InvestorProfile.updateMany(
            { _id: { $in: objectIds } },
            {
                $push: {
                    contactHistory: {
                        contactType,
                        message,
                        fundingRequestId,
                        sentById,
                        sentAt: new Date()
                    }
                }
            }
        );
    }

    /**
     * Search investors by criteria
     * @param {Object} criteria - Search criteria
     * @returns {Array} - Array of matching investors
     */
    static async searchInvestors(criteria = {}) {
        const query = {
            email: { $exists: true, $ne: null, $ne: '' },
            emailVerified: true
        };

        if (criteria.industry) {
            query.investmentInterests = { $in: [criteria.industry] };
        }

        if (criteria.location) {
            query.location = { $regex: criteria.location, $options: 'i' };
        }

        if (criteria.amountRange) {
            query.amountRange = criteria.amountRange;
        }

        return await InvestorProfile.find(query)
            .select('_id email fullName company investmentInterests amountRange')
            .limit(criteria.limit || 50)
            .lean();
    }
}

module.exports = InvestorService;