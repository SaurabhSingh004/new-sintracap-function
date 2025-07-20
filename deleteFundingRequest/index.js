const {
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const dbConfig = require('../shared/config/db.config');
const FundingRequest = require('../models/fundingRequest');
const FounderInvestorMatch = require('../models/founderInvestorMatch');
const Notification = require('../models/notification');
const authenticateToken = require('../shared/middleware/authenticateToken');

// Main function handler
async function deleteFundingRequestHandler(context, req) {
    await ensureDbConnection(dbConfig, context);
    
    const authenticatedUser = await authenticateToken(context, req);
    if (!authenticatedUser) {
        return;
    }
    
    const fundingRequestId = context.bindingData.fundingRequestId;
    
    if (!fundingRequestId) {
        throw new ValidationError('Funding request ID is required');
    }
    
    try {
        // Find the funding request
        const fundingRequest = await FundingRequest.findById(fundingRequestId)
            .populate('founderId', 'companyName email');
        
        if (!fundingRequest) {
            throw new ValidationError('Funding request not found');
        }
        
        // Check authorization - only admin or the founder who created it can delete
        const isAdmin = authenticatedUser.role === 'admin';
        const isOwner = authenticatedUser.role === 'founder' && 
                       fundingRequest.founderId._id.toString() === authenticatedUser._id.toString();
        
        if (!isAdmin && !isOwner) {
            throw new ValidationError('Access denied. Only admins or the request creator can delete this funding request');
        }
        
        // Get count of related matches before deletion (for logging)
        const relatedMatchesCount = await FounderInvestorMatch.countDocuments({
            fundingRequestId: fundingRequestId
        });
        
        // Delete all related founder-investor matches first
        await FounderInvestorMatch.deleteMany({
            fundingRequestId: fundingRequestId
        });
        
        // Delete the funding request
        await FundingRequest.findByIdAndDelete(fundingRequestId);
        
        // Create notification for founder if deleted by admin
        if (isAdmin && fundingRequest.founderId._id) {
            const notification = new Notification({
                recipientId: fundingRequest.founderId._id,
                recipientType: 'founder',
                senderId: authenticatedUser._id,
                senderType: 'admin',
                type: 'funding_request_deleted',
                title: 'Funding Request Deleted',
                message: `Your funding request for ${fundingRequest.fundingStage} funding of ${fundingRequest.currency} ${fundingRequest.fundingAmount.toLocaleString()} has been deleted by admin.`,
                relatedEntityId: fundingRequestId,
                relatedEntityType: 'funding_request',
                priority: 'high',
                actionUrl: `/founder/funding-requests`,
                actionText: 'View All Requests'
            });
            
            await notification.save();
        }
        
        // Log the deletion
        context.log.info(`Funding request ${fundingRequestId} deleted by ${authenticatedUser.role} ${authenticatedUser._id}. Removed ${relatedMatchesCount} related matches.`);
        
        return {
            message: 'Funding request successfully deleted',
            data: {
                deletedFundingRequestId: fundingRequestId,
                companyName: fundingRequest.founderId.companyName,
                fundingAmount: fundingRequest.fundingAmount,
                fundingStage: fundingRequest.fundingStage,
                status: fundingRequest.status,
                deletedBy: {
                    role: authenticatedUser.role,
                    userId: authenticatedUser._id
                },
                relatedMatchesDeleted: relatedMatchesCount,
                deletedAt: new Date().toISOString(),
                founderNotified: isAdmin && fundingRequest.founderId._id ? true : false
            }
        };
        
    } catch (error) {
        context.log.error('Error deleting funding request:', error);
        
        if (error instanceof ValidationError) {
            throw error;
        }
        
        throw new Error('Failed to delete funding request');
    }
}

module.exports = azureFunctionWrapper(deleteFundingRequestHandler, {
    requireAuth: true,
    validateInput: null,
    enableCors: true,
    timeout: 15000
});