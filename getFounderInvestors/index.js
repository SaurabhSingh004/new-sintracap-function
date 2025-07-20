    const {
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const AuthService = require('../shared/services/authService');
const dbConfig = require('../shared/config/db.config');
const FundingRequest = require('../models/fundingRequest');
const FounderInvestorMatch = require('../models/founderInvestorMatch');
const authenticateToken = require('../shared/middleware/authenticateToken')
// Helper function to sanitize investor data (remove contact info)
const sanitizeInvestorData = (investor) => {
    const {
        email,
        phone,
        linkedIn,
        ...sanitizedInvestor
    } = investor;
    
    return {
        ...sanitizedInvestor,
        // Keep only non-contact information
        contactAvailable: true // Indicator that contact info exists but is hidden
    };
};

// Main function handler
async function getFounderInvestorsHandler(context, req) {
    // Ensure database connection
    await ensureDbConnection(dbConfig, context);
    
    const authenticatedUser = await authenticateToken(context, req);
    if (!authenticatedUser) {
        return; // Response already set by authenticateToken middleware
    }
    
    // Get funding request ID from route parameter
    const fundingRequestId = context.bindingData.fundingRequestId;
    
    if (!fundingRequestId) {
        throw new ValidationError('Funding request ID is required');
    }
    
    // Extract query parameters for filtering and pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const sortBy = req.query.sortBy || 'matchScore'; // matchScore, createdAt, investorName
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    const status = req.query.status; // active, contacted, interested, declined, funded
    const minMatchScore = req.query.minMatchScore ? parseInt(req.query.minMatchScore) : null;
    
    // Validate pagination
    if (page < 1) {
        throw new ValidationError('Page number must be greater than 0');
    }
    
    if (limit < 1 || limit > 50) {
        throw new ValidationError('Limit must be between 1 and 50');
    }
    // Verify funding request belongs to this founder
    const fundingRequest = await FundingRequest.findOne({
        _id: fundingRequestId
    });
    
    if (!fundingRequest) {
        throw new ValidationError('Funding request not found or access denied');
    }
    
    // Build filter for matches
    const matchFilter = {
        fundingRequestId
    };
    
    if (status) {
        if (!['active', 'contacted', 'interested', 'declined', 'funded'].includes(status)) {
            throw new ValidationError('Invalid status filter');
        }
        matchFilter.status = status;
    }
    
    if (minMatchScore !== null) {
        matchFilter.matchScore = { $gte: minMatchScore };
    }
    
    // Calculate skip for pagination
    const skip = (page - 1) * limit;
    
    // Build sort object
    let sort = {};
    if (sortBy === 'investorName') {
        sort = { 'investorId.fullName': sortOrder };
    } else if (sortBy === 'matchScore') {
        sort = { matchScore: sortOrder };
    } else {
        sort[sortBy] = sortOrder;
    }
    
    try {
        // Get total count
        const totalCount = await FounderInvestorMatch.countDocuments(matchFilter);
        
        if (totalCount === 0) {
            return {
                message: 'No investors assigned to this funding request yet',
                data: {
                    fundingRequest: {
                        _id: fundingRequest._id,
                        fundingAmount: fundingRequest.fundingAmount,
                        currency: fundingRequest.currency,
                        fundingStage: fundingRequest.fundingStage,
                        status: fundingRequest.status,
                        refreshCount: fundingRequest.refreshCount,
                        canRefresh: fundingRequest.status === 'allotted' && fundingRequest.refreshCount < 3
                    },
                    investors: [],
                    pagination: {
                        currentPage: page,
                        totalPages: 0,
                        totalCount: 0,
                        pageSize: limit,
                        hasNextPage: false,
                        hasPreviousPage: false
                    }
                }
            };
        }
        
        // Fetch matches with investor details
        const matches = await FounderInvestorMatch.find(matchFilter)
            .populate('investorId', 'fullName company designation location bio investmentInterests amountRange photoURL previousInvestments notableExits')
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .lean();
        
        // Sanitize investor data and format response
        const sanitizedInvestors = matches.map(match => {
            const sanitizedInvestor = sanitizeInvestorData(match.investorId);
            
            return {
                matchId: match._id,
                investor: {
                    _id: sanitizedInvestor._id,
                    emailSent: match.emailSent,
                    fullName: sanitizedInvestor.fullName,
                    company: sanitizedInvestor.company,
                    designation: sanitizedInvestor.designation,
                    location: sanitizedInvestor.location,
                    bio: sanitizedInvestor.bio,
                    investmentInterests: sanitizedInvestor.investmentInterests,
                    amountRange: sanitizedInvestor.amountRange,
                    photoURL: sanitizedInvestor.photoURL,
                    notableExits: sanitizedInvestor.notableExits,
                    experienceYears: sanitizedInvestor.previousInvestments?.length || 0,
                    contactAvailable: sanitizedInvestor.contactAvailable
                },
                matchDetails: {
                    matchScore: match.matchScore,
                    matchCriteria: match.matchCriteria,
                    assignmentMethod: match.assignmentMethod,
                    status: match.status,
                    contactedAt: match.contactedAt,
                    responseAt: match.responseAt,
                    notes: match.notes,
                    createdAt: match.createdAt
                }
            };
        });
        
        // Get match statistics
        const [statusCounts, matchScoreStats] = await Promise.all([
            FounderInvestorMatch.aggregate([
                { $match: { fundingRequestId: fundingRequest._id, founderId: fundingRequest.founderId } },
                { $group: { _id: '$status', count: { $sum: 1 } } }
            ]),
            FounderInvestorMatch.aggregate([
                { $match: { fundingRequestId: fundingRequest._id, founderId: fundingRequest.founderId } },
                {
                    $group: {
                        _id: null,
                        avgScore: { $avg: '$matchScore' },
                        maxScore: { $max: '$matchScore' },
                        minScore: { $min: '$matchScore' }
                    }
                }
            ])
        ]);
        
        const statusSummary = {};
        statusCounts.forEach(item => {
            statusSummary[item._id] = item.count;
        });
        
        const totalPages = Math.ceil(totalCount / limit);
        
        return {
            message: `Found ${totalCount} assigned investor${totalCount > 1 ? 's' : ''} (page ${page} of ${totalPages})`,
            data: {
                fundingRequest: {
                    _id: fundingRequest._id,
                    fundingAmount: fundingRequest.fundingAmount,
                    currency: fundingRequest.currency,
                    fundingStage: fundingRequest.fundingStage,
                    equityOffered: fundingRequest.equityOffered,
                    status: fundingRequest.status,
                    refreshCount: fundingRequest.refreshCount,
                    canRefresh: fundingRequest.status === 'allotted' && fundingRequest.refreshCount < 3,
                    allottedAt: fundingRequest.allottedAt,
                    allotmentMethod: fundingRequest.allotmentMethod,
                    aiMatchScore: fundingRequest.aiMatchScore
                },
                investors: sanitizedInvestors,
                pagination: {
                    currentPage: page,
                    totalPages,
                    totalCount,
                    pageSize: limit,
                    hasNextPage: page < totalPages,
                    hasPreviousPage: page > 1
                },
                statistics: {
                    totalAssigned: totalCount,
                    statusBreakdown: {
                        active: statusSummary.active || 0,
                        contacted: statusSummary.contacted || 0,
                        interested: statusSummary.interested || 0,
                        declined: statusSummary.declined || 0,
                        funded: statusSummary.funded || 0
                    },
                    matchScoreStats: matchScoreStats[0] || {
                        avgScore: 0,
                        maxScore: 0,
                        minScore: 0
                    }
                },
                filters: {
                    status,
                    minMatchScore,
                    sortBy,
                    sortOrder: sortOrder === 1 ? 'asc' : 'desc'
                }
            }
        };
        
    } catch (error) {
        context.log.error('Error fetching founder investors:', error);
        throw new Error('Failed to fetch assigned investors');
    }
}

// Export wrapped function
module.exports = azureFunctionWrapper(getFounderInvestorsHandler, {
    requireAuth: true,
    validateInput: null,
    enableCors: true,
    timeout: 20000
});