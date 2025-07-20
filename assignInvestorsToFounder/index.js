const {
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const dbConfig = require('../shared/config/db.config');
const FundingRequest = require('../models/fundingRequest');
const FounderInvestorMatch = require('../models/founderInvestorMatch');
const InvestorProfile = require('../models/sintracapInvestor');
const Notification = require('../models/notification');
const authenticateToken = require('../shared/middleware/authenticateToken');

// Constants
const MINIMUM_INVESTORS_FOR_ALLOTMENT = 5;

// AI Matching Service
const calculateMatchScore = (founder, investor, fundingRequest) => {
    let score = 0;
    const criteria = {
        industryMatch: false,
        stageMatch: false,
        amountMatch: false,
        locationMatch: false,
        experienceMatch: false
    };
    
    // Industry match (30% weight)
    if (investor.investmentInterests && investor.investmentInterests.includes(founder.industry)) {
        score += 30;
        criteria.industryMatch = true;
    }
    
    // Stage match (25% weight)
    const investorStages = investor.previousInvestments?.map(inv => inv.stage) || [];
    if (investorStages.includes(fundingRequest.fundingStage)) {
        score += 25;
        criteria.stageMatch = true;
    }
    
    // Amount range match (20% weight)
    if (investor.amountRange) {
        const ranges = {
            '10K-50K': { min: 10000, max: 50000 },
            '50K-100K': { min: 50000, max: 100000 },
            '100K-500K': { min: 100000, max: 500000 },
            '500K-1M': { min: 500000, max: 1000000 },
            '1M-5M': { min: 1000000, max: 5000000 },
            '5M+': { min: 5000000, max: Infinity }
        };
        
        const range = ranges[investor.amountRange];
        if (range && fundingRequest.fundingAmount >= range.min && fundingRequest.fundingAmount <= range.max) {
            score += 20;
            criteria.amountMatch = true;
        }
    }
    
    // Location match (15% weight)
    if (investor.location && founder.address && 
        investor.location.toLowerCase().includes(founder.address.toLowerCase().split(',')[0])) {
        score += 15;
        criteria.locationMatch = true;
    }
    
    // Experience match (10% weight)
    const investorExperienceYears = investor.previousInvestments?.length || 0;
    if (investorExperienceYears >= 3) {
        score += 10;
        criteria.experienceMatch = true;
    }
    
    return { score: Math.min(score, 100), criteria };
};

// Get AI-matched investors (excluding already assigned ones)
const getAIMatchedInvestors = async (fundingRequest, founder, count) => {
    // Get currently assigned investor IDs for this funding request
    const existingMatches = await FounderInvestorMatch.find({
        fundingRequestId: fundingRequest._id
    }).select('investorId').lean();
    
    const excludeInvestorIds = existingMatches.map(match => match.investorId.toString());
    
    // Get all verified investors excluding already assigned ones
    const allInvestors = await InvestorProfile.find({
        isVerifiedByAdmin: true,
        _id: { $nin: excludeInvestorIds }
        // signupStatus: 'complete'
    }).lean();
    
    // Calculate match scores
    const scoredInvestors = allInvestors.map(investor => {
        const matchResult = calculateMatchScore(founder, investor, fundingRequest);
        return {
            investor,
            matchScore: matchResult.score,
            matchCriteria: matchResult.criteria
        };
    });
    
    // Sort by match score and return top matches
    return scoredInvestors
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, count);
};

// Input validation
const validateAssignmentRequest = (data) => {
    const { fundingRequestId, assignmentMethod } = data;
    
    if (!fundingRequestId) {
        throw new ValidationError('Funding request ID is required');
    }
    
    if (!assignmentMethod || !['manual', 'ai'].includes(assignmentMethod)) {
        throw new ValidationError('Assignment method must be either "manual" or "ai"');
    }
    
    return true;
};

// Main function handler
async function assignInvestorsToFounderHandler(context, req) {
    // Ensure database connection
    await ensureDbConnection(dbConfig, context);
    
    const authenticatedUser = await authenticateToken(context, req);
    if (!authenticatedUser) {
        return; // Response already set by authenticateToken middleware
    }
    
    // Validate input
    validateAssignmentRequest(req.body);
    
    const {
        fundingRequestId,
        assignmentMethod,
        investorIds = [], // For manual assignment
        investorCount = 5,  // For AI assignment
        replaceExisting = false // Whether to replace all existing matches or add to them
    } = req.body;
    
    // Get funding request
    const fundingRequest = await FundingRequest.findById(fundingRequestId)
        .populate('founderId');
    
    if (!fundingRequest) {
        throw new ValidationError('Funding request not found');
    }
    
    const founder = fundingRequest.founderId;
    
    // Get current total assigned investors
    const currentAssignedCount = await FounderInvestorMatch.countDocuments({ 
        fundingRequestId 
    });
    
    // If replaceExisting is true, clear existing assignments
    if (replaceExisting) {
        await FounderInvestorMatch.deleteMany({ fundingRequestId });
    }
    
    let assignedInvestors = [];
    let selectedInvestors = [];
    
    if (assignmentMethod === 'manual') {
        if (!investorIds || investorIds.length === 0) {
            throw new ValidationError('Investor IDs are required for manual assignment');
        }
        
        let validInvestorIds = investorIds;
        let skippedInvestors = [];
        
        // Check for duplicate assignments if not replacing existing
        if (!replaceExisting) {
            const existingMatches = await FounderInvestorMatch.find({
                fundingRequestId,
                investorId: { $in: investorIds }
            }).select('investorId').lean();
            
            const alreadyAssignedIds = existingMatches.map(match => match.investorId.toString());
            const duplicateIds = investorIds.filter(id => alreadyAssignedIds.includes(id));
            
            if (duplicateIds.length > 0) {
                // If ALL provided investors are already assigned, throw error
                if (duplicateIds.length === investorIds.length) {
                    context.res = {
                        status: 400,
                        body: {
                            success: false,
                            statusCode: 400,
                            message: `All provided investors are already assigned to this funding request: ${duplicateIds.join(', ')}`,
                            data: null,
                            timestamp: new Date().toISOString()
                        }
                    };
                    return;
                }
                
                // Filter out already assigned investors and continue with the rest
                validInvestorIds = investorIds.filter(id => !alreadyAssignedIds.includes(id));
                skippedInvestors = duplicateIds;
                
                context.log(`Skipping already assigned investors: ${duplicateIds.join(', ')}`);
                context.log(`Proceeding with: ${validInvestorIds.join(', ')}`);
            }
        }
        
        // Validate remaining investor IDs
        const investors = await InvestorProfile.find({
            _id: { $in: validInvestorIds },
            // isVerifiedByAdmin: true
        }).lean();
        
        const foundInvestorIds = investors.map(inv => inv._id.toString());
        const invalidIds = validInvestorIds.filter(id => !foundInvestorIds.includes(id));
        
        if (invalidIds.length > 0) {
            throw new ValidationError(`Some investor IDs are invalid or not verified: ${invalidIds.join(', ')}`);
        }
        
        selectedInvestors = investors.map(investor => ({
            investor,
            matchScore: 0, // Manual assignment doesn't have AI score
            matchCriteria: {
                industryMatch: false,
                stageMatch: false,
                amountMatch: false,
                locationMatch: false,
                experienceMatch: false
            }
        }));
        
        // Store skipped investors info for response
        context.skippedInvestors = skippedInvestors;
        
    } else if (assignmentMethod === 'ai') {
        const count = Math.min(Math.max(investorCount, 1), 20); // Limit between 1-20
        selectedInvestors = await getAIMatchedInvestors(fundingRequest, founder, count);
        
        if (selectedInvestors.length === 0) {
            throw new ValidationError('No suitable investors found using AI matching. All available investors may already be assigned.');
        }
    }
    
    // Create founder-investor matches
    const matches = selectedInvestors.map(({ investor, matchScore, matchCriteria }) => ({
        fundingRequestId,
        founderId: founder._id,
        investorId: investor._id,
        matchScore,
        matchCriteria,
        assignedBy: authenticatedUser._id,
        assignmentMethod,
        status: 'active'
    }));
    
    assignedInvestors = await FounderInvestorMatch.insertMany(matches);
    
    // Calculate total investors after this assignment
    const totalAssignedInvestors = replaceExisting ? 
        assignedInvestors.length : 
        currentAssignedCount + assignedInvestors.length;
    
    // Determine if funding request should be marked as allotted
    const shouldMarkAsAllotted = totalAssignedInvestors >= MINIMUM_INVESTORS_FOR_ALLOTMENT;
    
    // Update funding request status based on threshold
    let statusMessage = '';
    if (shouldMarkAsAllotted && fundingRequest.status !== 'allotted') {
        fundingRequest.status = 'allotted';
        fundingRequest.allottedAt = new Date();
        fundingRequest.allottedBy = authenticatedUser._id;
        fundingRequest.allotmentMethod = assignmentMethod;
        statusMessage = ` Funding request marked as ALLOTTED (${totalAssignedInvestors} investors assigned).`;
    } else if (!shouldMarkAsAllotted) {
        fundingRequest.status = 'open';
        statusMessage = ` Funding request remains OPEN (${totalAssignedInvestors}/${MINIMUM_INVESTORS_FOR_ALLOTMENT} investors assigned).`;
    } else {
        statusMessage = ` Funding request already allotted (${totalAssignedInvestors} investors total).`;
    }
    
    // Calculate AI match score if AI assignment
    if (assignmentMethod === 'ai' && selectedInvestors.length > 0) {
        const currentAiScore = selectedInvestors.reduce((sum, inv) => sum + inv.matchScore, 0) / selectedInvestors.length;
        
        if (fundingRequest.aiMatchScore) {
            // Recalculate average with existing AI scores
            const existingAiMatches = await FounderInvestorMatch.find({
                fundingRequestId,
                assignmentMethod: 'ai',
                _id: { $nin: assignedInvestors.map(match => match._id) }
            }).select('matchScore').lean();
            
            const allAiScores = [
                ...existingAiMatches.map(match => match.matchScore),
                ...selectedInvestors.map(inv => inv.matchScore)
            ];
            
            fundingRequest.aiMatchScore = allAiScores.reduce((sum, score) => sum + score, 0) / allAiScores.length;
        } else {
            fundingRequest.aiMatchScore = currentAiScore;
        }
    }
    
    await fundingRequest.save();
    
    // Create appropriate notification for founder
    const notificationTitle = shouldMarkAsAllotted && fundingRequest.status === 'allotted' ?
        'Funding Request Fully Allotted!' :
        'New Investors Assigned';
    
    const notificationMessage = shouldMarkAsAllotted && fundingRequest.status === 'allotted' ?
        `Congratulations! Your funding request for ${fundingRequest.currency} ${fundingRequest.fundingAmount.toLocaleString()} is now fully allotted with ${totalAssignedInvestors} qualified investors. You can start reaching out to them immediately.` :
        `We've assigned ${assignedInvestors.length} more investor${assignedInvestors.length > 1 ? 's' : ''} to your funding request. You now have ${totalAssignedInvestors} out of ${MINIMUM_INVESTORS_FOR_ALLOTMENT} minimum investors needed for full allotment.`;
    
    const notification = new Notification({
        recipientId: founder._id,
        recipientType: 'founder',
        senderId: authenticatedUser._id,
        senderType: 'admin',
        type: shouldMarkAsAllotted && fundingRequest.status === 'allotted' ? 'funding_allotted' : 'investors_assigned',
        title: notificationTitle,
        message: notificationMessage,
        relatedEntityId: fundingRequest._id,
        relatedEntityType: 'funding_request',
        priority: shouldMarkAsAllotted ? 'high' : 'medium',
        actionUrl: `/founder/funding-requests/${fundingRequest._id}/investors`,
        actionText: 'View Assigned Investors'
    });
    
    await notification.save();
    
    // Populate response data with all assigned investors (not just newly assigned)
    const populatedMatches = await FounderInvestorMatch.find({
        fundingRequestId
    })
    .populate('investorId', 'fullName company designation location investmentInterests amountRange photoURL')
    .populate('founderId', 'companyName industry')
    .sort({ createdAt: -1 })
    .lean();
    
    // Build success message with skipped investors info
    let successMessage = `Successfully assigned ${assignedInvestors.length} new investor${assignedInvestors.length > 1 ? 's' : ''} to ${founder.companyName}.${statusMessage}`;
    
    if (context.skippedInvestors && context.skippedInvestors.length > 0) {
        successMessage += ` Note: Skipped ${context.skippedInvestors.length} already assigned investor${context.skippedInvestors.length > 1 ? 's' : ''}.`;
    }
    
    context.res = {
        status: 200,
        body: {
            message: successMessage,
            success: true,
            data: {
                fundingRequest: {
                    _id: fundingRequest._id,
                    status: fundingRequest.status,
                    allottedAt: fundingRequest.allottedAt,
                    allotmentMethod: fundingRequest.allotmentMethod,
                    aiMatchScore: fundingRequest.aiMatchScore,
                    isFullyAllotted: shouldMarkAsAllotted,
                    minimumInvestorsRequired: MINIMUM_INVESTORS_FOR_ALLOTMENT
                },
                assignedInvestors: populatedMatches.map(match => ({
                    matchId: match._id,
                    investor: {
                        _id: match.investorId._id,
                        fullName: match.investorId.fullName,
                        company: match.investorId.company,
                        designation: match.investorId.designation,
                        location: match.investorId.location,
                        investmentInterests: match.investorId.investmentInterests,
                        amountRange: match.investorId.amountRange,
                        photoURL: match.investorId.photoURL
                    },
                    matchScore: match.matchScore,
                    matchCriteria: match.matchCriteria,
                    assignmentMethod: match.assignmentMethod,
                    status: match.status,
                    createdAt: match.createdAt,
                    isNewlyAssigned: assignedInvestors.some(newMatch => 
                        newMatch._id.toString() === match._id.toString()
                    )
                })),
                summary: {
                    totalAssigned: totalAssignedInvestors,
                    newlyAssigned: assignedInvestors.length,
                    minimumRequired: MINIMUM_INVESTORS_FOR_ALLOTMENT,
                    isFullyAllotted: shouldMarkAsAllotted,
                    remainingNeeded: Math.max(0, MINIMUM_INVESTORS_FOR_ALLOTMENT - totalAssignedInvestors),
                    assignmentMethod,
                    averageMatchScore: assignmentMethod === 'ai' 
                        ? fundingRequest.aiMatchScore 
                        : null,
                    skippedInvestors: context.skippedInvestors || [],
                    skippedCount: context.skippedInvestors ? context.skippedInvestors.length : 0
                }
            }
        }
    };
}

// Export wrapped function
module.exports = azureFunctionWrapper(assignInvestorsToFounderHandler, {
    requireAuth: true,
    validateInput: null,
    enableCors: true,
    timeout: 30000
});