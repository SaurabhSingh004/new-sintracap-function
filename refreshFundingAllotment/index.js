const {
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const AuthService = require('../shared/services/authService');
const dbConfig = require('../shared/config/db.config');
const FundingRequest = require('../models/fundingRequest');
const FounderInvestorMatch = require('../models/founderInvestorMatch');
const Notification = require('../models/notification');

// Main function handler
async function refreshFundingAllotmentHandler(context, req) {
    // Ensure database connection
    await ensureDbConnection(dbConfig, context);
    
    // Get authenticated user (founder)
    const user = await AuthService.authenticate(req);
    
    if (!user || user.role !== 'founder') {
        throw new ValidationError('Only founders can refresh funding allotments');
    }
    
    // Get funding request ID from route parameter
    const fundingRequestId = context.bindingData.fundingRequestId;
    
    if (!fundingRequestId) {
        throw new ValidationError('Funding request ID is required');
    }
    
    // Optional reason for refresh
    const { reason } = req.body;
    
    // Find and validate funding request
    const fundingRequest = await FundingRequest.findOne({
        _id: fundingRequestId,
        founderId: user._id
    }).populate('founderId', 'companyName email');
    
    if (!fundingRequest) {
        throw new ValidationError('Funding request not found or access denied');
    }
    
    // Check if funding request is in allotted status
    if (fundingRequest.status !== 'allotted') {
        throw new ValidationError('Can only refresh allotted funding requests');
    }
    
    // Check refresh limit
    const MAX_REFRESH_COUNT = 3;
    if (fundingRequest.refreshCount >= MAX_REFRESH_COUNT) {
        throw new ValidationError(`Maximum refresh limit (${MAX_REFRESH_COUNT}) reached for this funding request`);
    }
    
    // Check cooldown period (optional - to prevent spam)
    const COOLDOWN_HOURS = 24;
    if (fundingRequest.lastRefreshedAt) {
        const hoursSinceLastRefresh = (Date.now() - fundingRequest.lastRefreshedAt.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastRefresh < COOLDOWN_HOURS) {
            const remainingHours = Math.ceil(COOLDOWN_HOURS - hoursSinceLastRefresh);
            throw new ValidationError(`Please wait ${remainingHours} hour${remainingHours > 1 ? 's' : ''} before refreshing again`);
        }
    }
    
    try {
        // Get current assigned investors count for reference
        const currentInvestorsCount = await FounderInvestorMatch.countDocuments({
            fundingRequestId
        });
        
        // Remove all current investor assignments
        await FounderInvestorMatch.deleteMany({ fundingRequestId });
        
        // Update funding request status and refresh count
        fundingRequest.status = 'open';
        fundingRequest.refreshCount += 1;
        fundingRequest.lastRefreshedAt = new Date();
        fundingRequest.allottedAt = null;
        fundingRequest.allottedBy = null;
        fundingRequest.allotmentMethod = null;
        fundingRequest.aiMatchScore = null;
        
        await fundingRequest.save();
        
        // Create notification for admin about the refresh request
        const adminNotification = new Notification({
            recipientId: null, // Admin notification
            recipientType: 'admin',
            senderId: user._id,
            senderType: 'founder',
            type: 'funding_refreshed',
            title: 'Funding Request Refreshed',
            message: `${fundingRequest.founderId.companyName} has refreshed their funding request (${fundingRequest.refreshCount}/${MAX_REFRESH_COUNT} refreshes used). ${currentInvestorsCount} previous investor assignments were cleared.${reason ? ` Reason: ${reason}` : ''}`,
            relatedEntityId: fundingRequest._id,
            relatedEntityType: 'funding_request',
            priority: 'medium',
            actionUrl: `/admin/funding-requests/${fundingRequest._id}`,
            actionText: 'Reassign Investors'
        });
        
        await adminNotification.save();
        
        // Create notification for founder confirming the refresh
        const founderNotification = new Notification({
            recipientId: user._id,
            recipientType: 'founder',
            senderType: 'system',
            type: 'funding_refreshed',
            title: 'Funding Request Refreshed Successfully',
            message: `Your funding request has been refreshed and is now open for new investor assignments. You have ${MAX_REFRESH_COUNT - fundingRequest.refreshCount} refresh${MAX_REFRESH_COUNT - fundingRequest.refreshCount !== 1 ? 'es' : ''} remaining.`,
            relatedEntityId: fundingRequest._id,
            relatedEntityType: 'funding_request',
            priority: 'medium',
            actionUrl: `/founder/funding-requests/${fundingRequest._id}`,
            actionText: 'View Request Status'
        });
        
        await founderNotification.save();
        
        return {
            message: 'Funding request refreshed successfully',
            data: {
                fundingRequest: {
                    _id: fundingRequest._id,
                    status: fundingRequest.status,
                    refreshCount: fundingRequest.refreshCount,
                    maxRefreshCount: MAX_REFRESH_COUNT,
                    remainingRefreshes: MAX_REFRESH_COUNT - fundingRequest.refreshCount,
                    lastRefreshedAt: fundingRequest.lastRefreshedAt,
                    canRefreshAgain: fundingRequest.refreshCount < MAX_REFRESH_COUNT
                },
                previousAssignment: {
                    investorsRemoved: currentInvestorsCount,
                    removedAt: new Date()
                },
                nextSteps: {
                    waitingForAdmin: true,
                    estimatedReassignmentTime: '24-48 hours',
                    message: 'Your request is now in the queue for admin review and new investor assignment'
                }
            }
        };
        
    } catch (error) {
        context.log.error('Error refreshing funding allotment:', error);
        
        // Rollback: If there was an error, try to restore the original state
        try {
            fundingRequest.status = 'allotted';
            fundingRequest.refreshCount -= 1;
            fundingRequest.lastRefreshedAt = null;
            await fundingRequest.save();
        } catch (rollbackError) {
            context.log.error('Error during rollback:', rollbackError);
        }
        
        throw new Error('Failed to refresh funding allotment. Please try again later.');
    }
}

// Export wrapped function
module.exports = azureFunctionWrapper(refreshFundingAllotmentHandler, {
    requireAuth: true,
    validateInput: null,
    enableCors: true,
    timeout: 15000
});