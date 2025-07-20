const {
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const dbConfig = require('../shared/config/db.config');
const FundingRequest = require('../models/fundingRequest');
const FounderInvestorMatch = require('../models/founderInvestorMatch');
const authenticateToken = require('../shared/middleware/authenticateToken');

// Simplified function handler
async function removeInvestorFromFundingHandler(context, req) {
    await ensureDbConnection(dbConfig, context);
    
    const authenticatedUser = await authenticateToken(context, req);
    if (!authenticatedUser) {
        return;
    }
    
    const fundingRequestId = context.bindingData.fundingRequestId;
    const investorId = context.bindingData.investorId;
    
    if (!fundingRequestId) {
        throw new ValidationError('Funding request ID is required');
    }
    
    if (!investorId) {
        throw new ValidationError('Investor ID is required');
    }
    
    try {
        // Verify funding request exists and user has access
        let fundingRequestQuery = { _id: fundingRequestId };
        
        // Founders can only access their own funding requests
        if (authenticatedUser.role === 'founder') {
            fundingRequestQuery.founderId = authenticatedUser._id;
        }
        
        const fundingRequest = await FundingRequest.findOne(fundingRequestQuery);
        if (!fundingRequest) {
            throw new ValidationError('Funding request not found or access denied');
        }
        
        // Find and delete the match
        const match = await FounderInvestorMatch.findOneAndDelete({
            fundingRequestId,
            investorId
        });
        
        if (!match) {
            throw new ValidationError('Investor assignment not found');
        }
        
        // Check if any matches remain
        const remainingMatches = await FounderInvestorMatch.countDocuments({
            fundingRequestId
        });
        
        // If no matches remain, reset funding request status
        if (remainingMatches === 0) {
            await FundingRequest.findByIdAndUpdate(fundingRequestId, {
                status: 'open',
                allottedAt: null
            });
        }
        
        return {
            success: true,
            message: 'Investor successfully removed from funding request',
            data: {
                removedInvestorId: investorId,
                remainingMatches,
                fundingRequestStatus: remainingMatches === 0 ? 'open' : fundingRequest.status
            }
        };
        
    } catch (error) {
        context.log.error('Error removing investor:', error);
        
        if (error instanceof ValidationError) {
            throw error;
        }
        
        throw new Error('Failed to remove investor from funding request');
    }
}

module.exports = azureFunctionWrapper(removeInvestorFromFundingHandler, {
    requireAuth: true,
    validateInput: null,
    enableCors: true,
    timeout: 15000
});