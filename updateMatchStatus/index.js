// updateMatchStatus/index.js
const {
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const AuthService = require('../shared/services/authService');
const dbConfig = require('../shared/config/db.config');
const FounderInvestorMatch = require('../models/founderInvestorMatch');
const Notification = require('../models/notification');

// Input validation
const validateStatusUpdate = (data) => {
    const { status, notes } = data;
    
    const validStatuses = ['active', 'contacted', 'interested', 'declined', 'funded'];
    
    if (!status) {
        throw new ValidationError('Status is required');
    }
    
    if (!validStatuses.includes(status)) {
        throw new ValidationError(`Invalid status. Valid statuses: ${validStatuses.join(', ')}`);
    }
    
    if (notes && notes.length > 500) {
        throw new ValidationError('Notes cannot exceed 500 characters');
    }
    
    return true;
};

// Main function handler
async function updateMatchStatusHandler(context, req) {
    // Ensure database connection
    await ensureDbConnection(dbConfig, context);
    
    // Get authenticated user (founder)
    const user = await AuthService.authenticate(req);
    
    if (!user || user.role !== 'founder') {
        throw new ValidationError('Only founders can update match status');
    }
    
    // Get match ID from route parameter
    const matchId = context.bindingData.matchId;
    
    if (!matchId) {
        throw new ValidationError('Match ID is required');
    }
    
    // Validate input
    validateStatusUpdate(req.body);
    
    const { status, notes } = req.body;
    
    try {
        // Find the match and verify ownership
        const match = await FounderInvestorMatch.findOne({
            _id: matchId,
            founderId: user._id
        })
        .populate('investorId', 'fullName company designation')
        .populate('fundingRequestId', 'fundingAmount currency fundingStage');
        
        if (!match) {
            throw new ValidationError('Match not found or access denied');
        }
        
        // Store previous status for logging
        const previousStatus = match.status;
        const previousNotes = match.notes;
        
        // Validate status transition
        const validTransitions = {
            'active': ['contacted', 'declined'],
            'contacted': ['interested', 'declined'],
            'interested': ['funded', 'declined'],
            'declined': [], // Final state
            'funded': [] // Final state
        };
        
        const allowedNextStatuses = validTransitions[previousStatus];
        
        // Allow reverting from certain statuses
        const revertAllowed = {
            'contacted': ['active'],
            'interested': ['contacted'],
            'declined': ['active', 'contacted'] // Allow re-engaging
        };
        
        const allowedRevertStatuses = revertAllowed[previousStatus] || [];
        const allAllowedStatuses = [...allowedNextStatuses, ...allowedRevertStatuses];
        
        if (status === previousStatus) {
            // Same status - only update notes if provided
            if (notes !== undefined) {
                match.notes = notes;
                await match.save();
                
                return {
                    message: 'Match notes updated successfully',
                    data: {
                        match: {
                            _id: match._id,
                            status: match.status,
                            notes: match.notes,
                            previousNotes,
                            investor: {
                                _id: match.investorId._id,
                                fullName: match.investorId.fullName,
                                company: match.investorId.company,
                                designation: match.investorId.designation
                            },
                            fundingRequest: {
                                _id: match.fundingRequestId._id,
                                fundingAmount: match.fundingRequestId.fundingAmount,
                                currency: match.fundingRequestId.currency,
                                fundingStage: match.fundingRequestId.fundingStage
                            },
                            updatedAt: new Date()
                        }
                    }
                };
            } else {
                return {
                    message: 'No changes made to match status',
                    data: {
                        match: {
                            _id: match._id,
                            status: match.status,
                            notes: match.notes
                        }
                    }
                };
            }
        }
        
        if (!allAllowedStatuses.includes(status)) {
            throw new ValidationError(
                `Cannot change status from '${previousStatus}' to '${status}'. ` +
                `Allowed transitions: ${allAllowedStatuses.join(', ')}`
            );
        }
        
        // Update match status
        match.status = status;
        if (notes !== undefined) {
            match.notes = notes;
        }
        
        // Set timestamp based on status
        const now = new Date();
        if (status === 'contacted' && previousStatus === 'active') {
            match.contactedAt = now;
        } else if (status === 'interested' || status === 'funded') {
            match.responseAt = now;
        }
        
        await match.save();
        
        // Create notification for significant status changes
        if (['interested', 'funded', 'declined'].includes(status)) {
            let notificationTitle, notificationMessage, priority;
            
            switch (status) {
                case 'interested':
                    notificationTitle = 'Investor Showed Interest';
                    notificationMessage = `You've marked ${match.investorId.fullName} from ${match.investorId.company} as interested in your funding request.`;
                    priority = 'high';
                    break;
                case 'funded':
                    notificationTitle = 'Funding Success!';
                    notificationMessage = `Congratulations! You've successfully secured funding from ${match.investorId.fullName} (${match.investorId.company}).`;
                    priority = 'urgent';
                    break;
                case 'declined':
                    notificationTitle = 'Investor Status Updated';
                    notificationMessage = `You've marked ${match.investorId.fullName} from ${match.investorId.company} as declined.`;
                    priority = 'medium';
                    break;
            }
            
            const notification = new Notification({
                recipientId: user._id,
                recipientType: 'founder',
                senderType: 'system',
                type: 'investor_assigned',
                title: notificationTitle,
                message: notificationMessage,
                relatedEntityId: match._id,
                relatedEntityType: 'match',
                priority: priority
            });
            
            await notification.save();
        }
        
        // Get updated statistics for this funding request
        const statusStats = await FounderInvestorMatch.aggregate([
            { $match: { fundingRequestId: match.fundingRequestId._id } },
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);
        
        const statusBreakdown = {};
        statusStats.forEach(stat => {
            statusBreakdown[stat._id] = stat.count;
        });
        
        return {
            message: `Match status updated from '${previousStatus}' to '${status}' successfully`,
            data: {
                match: {
                    _id: match._id,
                    status: match.status,
                    previousStatus,
                    notes: match.notes,
                    matchScore: match.matchScore,
                    contactedAt: match.contactedAt,
                    responseAt: match.responseAt,
                    investor: {
                        _id: match.investorId._id,
                        fullName: match.investorId.fullName,
                        company: match.investorId.company,
                        designation: match.investorId.designation
                    },
                    fundingRequest: {
                        _id: match.fundingRequestId._id,
                        fundingAmount: match.fundingRequestId.fundingAmount,
                        currency: match.fundingRequestId.currency,
                        fundingStage: match.fundingRequestId.fundingStage
                    },
                    updatedAt: new Date()
                },
                fundingRequestStats: {
                    statusBreakdown,
                    totalMatches: Object.values(statusBreakdown).reduce((sum, count) => sum + count, 0)
                },
                nextActions: getNextActions(status)
            }
        };
        
    } catch (error) {
        context.log.error('Error updating match status:', error);
        
        if (error instanceof ValidationError) {
            throw error;
        }
        
        throw new Error('Failed to update match status');
    }
}

// Helper function to suggest next actions based on status
function getNextActions(status) {
    const actions = {
        'active': [
            'Review investor profile and previous investments',
            'Prepare pitch materials for outreach',
            'Research investor\'s investment thesis'
        ],
        'contacted': [
            'Follow up if no response within 1-2 weeks',
            'Prepare for potential investor meeting',
            'Gather additional information they might request'
        ],
        'interested': [
            'Schedule detailed discussion or pitch meeting',
            'Prepare due diligence materials',
            'Discuss investment terms and timeline'
        ],
        'declined': [
            'Request feedback for future improvements',
            'Focus on other interested investors',
            'Consider refining pitch for remaining prospects'
        ],
        'funded': [
            'Celebrate your success!',
            'Begin legal documentation process',
            'Update other investors about funding status'
        ]
    };
    
    return actions[status] || [];
}

// Export wrapped function
module.exports = azureFunctionWrapper(updateMatchStatusHandler, {
    requireAuth: true,
    validateInput: null,
    enableCors: true,
    timeout: 15000
});