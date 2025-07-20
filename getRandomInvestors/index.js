const {
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const AuthService = require('../shared/services/authService');
const dbConfig = require('../shared/config/db.config');
const InvestorProfile = require('../models/sintracapInvestor');
const FundingRequest = require('../models/fundingRequest');
const authenticateToken = require('../shared/middleware/authenticateToken');
// Helper function to sanitize investor data for random display
const sanitizeRandomInvestorData = (investor) => {
    return {
        _id: investor._id,
        fullName: investor.fullName,
        company: investor.company,
        designation: investor.designation,
        location: investor.location,
        bio: investor.bio ? investor.bio.substring(0, 200) + '...' : null, // Truncated bio
        investmentInterests: investor.investmentInterests,
        amountRange: investor.amountRange,
        photoURL: investor.photoURL,
        previousInvestments: investor.previousInvestments?.slice(0, 3).map(inv => ({
            companyName: inv.companyName,
            industry: inv.industry,
            stage: inv.stage,
            year: inv.year,
            status: inv.status
        })),
        notableExits: investor.notableExits?.slice(0, 3),
        experienceLevel: investor.previousInvestments?.length >= 10 ? 'Expert' : 
                        investor.previousInvestments?.length >= 5 ? 'Experienced' : 
                        investor.previousInvestments?.length >= 1 ? 'Intermediate' : 'New',
        isContactable: false, // No contact info in random view
        profileCompleteness: calculateProfileCompleteness(investor)
    };
};

// Calculate profile completeness percentage
const calculateProfileCompleteness = (investor) => {
    let score = 0;
    const maxScore = 10;
    
    if (investor.fullName) score += 1;
    if (investor.company) score += 1;
    if (investor.designation) score += 1;
    if (investor.location) score += 1;
    if (investor.bio && investor.bio.length > 50) score += 1;
    if (investor.investmentInterests && investor.investmentInterests.length > 0) score += 1;
    if (investor.amountRange) score += 1;
    if (investor.photoURL) score += 1;
    if (investor.previousInvestments && investor.previousInvestments.length > 0) score += 1;
    if (investor.isVerifiedByAdmin) score += 1;
    
    return Math.round((score / maxScore) * 100);
};

// Main function handler
async function getRandomInvestorsHandler(context, req) {
    // Ensure database connection
    await ensureDbConnection(dbConfig, context);
    
    // Get authenticated user (founder)
    const authenticatedUser = await authenticateToken(context, req);
    if (!authenticatedUser) {
        return; // Response already set by authenticateToken middleware
    }
    
    // Extract query parameters
    const count = Math.min(parseInt(req.query.count) || 5);
    const industry = req.query.industry;
    const amountRange = req.query.amountRange;
    const location = req.query.location;
    const experienceLevel = req.query.experienceLevel; // 'new', 'intermediate', 'experienced', 'expert'
    const page = parseInt(req.query.page) || 1;
    const includeProfile = req.query.includeProfile === 'true';
    
    // Check if founder has any active funding requests
    const activeFundingRequest = await FundingRequest.findOne({
        founderId: authenticatedUser._id,
        status: { $in: ['open', 'allotted'] }
    });
    
    if (activeFundingRequest) {
        return {
            message: 'You have an active funding request. Random investors are not available.',
            data: {
                hasActiveFundingRequest: true,
                activeFundingRequest: {
                    _id: activeFundingRequest._id,
                    status: activeFundingRequest.status,
                    fundingAmount: activeFundingRequest.fundingAmount,
                    currency: activeFundingRequest.currency,
                    fundingStage: activeFundingRequest.fundingStage,
                    createdAt: activeFundingRequest.createdAt
                },
                investors: [],
                redirectUrl: `/founder/funding-requests/${activeFundingRequest._id}`
            }
        };
    }
    
    // Build filter for random investors
    const filter = {
        isVerifiedByAdmin: true,
        signupStatus: 'complete'
    };
    
    if (industry) {
        filter.investmentInterests = { $in: [industry] };
    }
    
    if (amountRange) {
        filter.amountRange = amountRange;
    }
    
    if (location) {
        filter.location = { $regex: location, $options: 'i' };
    }
    
    try {
        // Get total count for the filter
        const totalCount = await InvestorProfile.countDocuments();
        
        if (totalCount === 0) {
            return {
                message: 'No investors found matching your criteria',
                data: {
                    hasActiveFundingRequest: false,
                    investors: [],
                    pagination: {
                        currentPage: page,
                        totalPages: 0,
                        totalCount: 0,
                        hasNextPage: false,
                        hasPreviousPage: false
                    },
                    filters: { industry, amountRange, location, experienceLevel }
                }
            };
        }
        
        // Calculate random skip to get different investors each time
        const maxSkip = Math.max(0, totalCount - count);
        const randomSkip = Math.floor(Math.random() * (maxSkip + 1));
        
        // Fetch random investors
        let investors = await InvestorProfile.find()
            .skip(randomSkip)
            .limit(count)
            .lean();
        
        // Randomize the order
        investors = investors.sort(() => Math.random() - 0.5);
        
        // Sanitize investor data
        const sanitizedInvestors = investors.map(sanitizeRandomInvestorData);
        
        // Get founder profile for better recommendations
        let recommendations = [];
        if (includeProfile) {
            const recommendedInvestors = await InvestorProfile.find({
                // isVerifiedByAdmin: true,
                // signupStatus: 'complete',
                _id: { $nin: investors.map(inv => inv._id) }
            })
            .limit(3)
            .lean();
            
            recommendations = recommendedInvestors.map(sanitizeRandomInvestorData);
        }
        
        // Calculate approximate pagination info
        const approximatePages = Math.ceil(totalCount / count);
        
        return {
            message: `Showing ${sanitizedInvestors.length} random verified investors`,
            data: {
                hasActiveFundingRequest: false,
                investors: sanitizedInvestors,
                recommendations: recommendations,
                pagination: {
                    currentPage: page,
                    totalPages: approximatePages,
                    totalCount: totalCount,
                    hasNextPage: true, // Always true for random results
                    hasPreviousPage: page > 1,
                    isRandomized: true
                },
                filters: {
                    industry,
                    amountRange,
                    location,
                    experienceLevel,
                    count
                },
                summary: {
                    totalInvestors: totalCount,
                    shownInvestors: sanitizedInvestors.length,
                    industryMatch: industry ? sanitizedInvestors.filter(inv => 
                        inv.investmentInterests?.includes(industry)).length : null,
                    verifiedInvestors: sanitizedInvestors.length // All are verified
                },
                callToAction: {
                    message: "Ready to get matched with the right investors?",
                    actionText: "Create Funding Request",
                    actionUrl: "/founder/funding-requests/create",
                    description: "Create a funding request to get AI-matched investors based on your specific needs"
                }
            }
        };
        
    } catch (error) {
        context.log.error('Error fetching random investors:', error);
        throw new Error('Failed to fetch random investors');
    }
}

// Export wrapped function
module.exports = azureFunctionWrapper(getRandomInvestorsHandler, {
    requireAuth: false,
    validateInput: null,
    enableCors: true,
    timeout: 15000
});