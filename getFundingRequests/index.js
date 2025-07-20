// getFundingRequests/index.js - Updated with status priority sorting
const {
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const AuthService = require('../shared/services/authService');
const dbConfig = require('../shared/config/db.config');
const FundingRequest = require('../models/fundingRequest');
const FounderInvestorMatch = require('../models/founderInvestorMatch');
const authenticateToken = require('../shared/middleware/authenticateToken');

// Main function handler
async function getFundingRequestsHandler(context, req) {
    // Handle CORS preflight request
    if (req.method === 'OPTIONS') {
        context.res = {
            status: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-ms-client-request-id',
                'Access-Control-Max-Age': '86400'
            },
            body: null
        };
        return;
    }

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-ms-client-request-id',
        "Content-Type": "application/json"
    };

    try {
        await ensureDbConnection(dbConfig, context);

        const authenticatedUser = await authenticateToken(context, req);
        if (!authenticatedUser) {
            return;
        }

        // Extract query parameters
        const status = req.query.status;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const sortBy = req.query.sortBy || 'createdAt';
        const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
        const fundingStage = req.query.fundingStage;
        const minAmount = req.query.minAmount ? parseFloat(req.query.minAmount) : null;
        const maxAmount = req.query.maxAmount ? parseFloat(req.query.maxAmount) : null;

        // Validate pagination parameters
        if (page < 1) {
            throw new ValidationError('Page number must be greater than 0');
        }

        if (limit < 1 || limit > 100) {
            throw new ValidationError('Limit must be between 1 and 100');
        }

        // Build query filter
        const filter = {};

        if (status && status !== 'all') {
            if (!['open', 'allotted', 'closed'].includes(status)) {
                throw new ValidationError('Invalid status. Must be: open, allotted, closed, or all');
            }
            filter.status = status;
        }

        if (fundingStage) {
            filter.fundingStage = fundingStage;
        }

        if (minAmount !== null || maxAmount !== null) {
            filter.fundingAmount = {};
            if (minAmount !== null) filter.fundingAmount.$gte = minAmount;
            if (maxAmount !== null) filter.fundingAmount.$lte = maxAmount;
        }

        // Calculate skip value for pagination
        const skip = (page - 1) * limit;

        // Get total count for pagination
        const totalCount = await FundingRequest.countDocuments(filter);

        // Use aggregation pipeline to add status priority and sort
        const pipeline = [
            { $match: filter },
            {
                $addFields: {
                    statusPriority: {
                        $switch: {
                            branches: [
                                { case: { $eq: ["$status", "open"] }, then: 1 },
                                { case: { $eq: ["$status", "allotted"] }, then: 2 },
                                { case: { $eq: ["$status", "closed"] }, then: 3 }
                            ],
                            default: 4
                        }
                    }
                }
            },
            {
                $sort: {
                    statusPriority: 1, // First sort by status priority (open, allotted, closed)
                    [sortBy]: sortOrder // Then by requested field
                }
            },
            { $skip: skip },
            { $limit: limit },
            {
                $lookup: {
                    from: 'companyprofiles',
                    localField: 'founderId',
                    foreignField: '_id',
                    as: 'founderId',
                    pipeline: [
                        {
                            $project: {
                                companyName: 1,
                                industry: 1,
                                sector: 1,
                                foundedDate: 1,
                                teamSize: 1,
                                website: 1,
                                email: 1,
                                phone: 1,
                                address: 1
                            }
                        }
                    ]
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'allottedBy',
                    foreignField: '_id',
                    as: 'allottedBy',
                    pipeline: [
                        {
                            $project: {
                                name: 1,
                                email: 1
                            }
                        }
                    ]
                }
            },
            {
                $unwind: {
                    path: '$founderId',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $unwind: {
                    path: '$allottedBy',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $project: {
                    statusPriority: 0 // Remove the helper field from results
                }
            }
        ];

        const fundingRequests = await FundingRequest.aggregate(pipeline);

        // For each funding request, get the assigned investors count
        const requestsWithDetails = await Promise.all(
            fundingRequests.map(async (request) => {
                
                return {
                    ...request,
                    canRefresh: request.status === 'allotted' && request.refreshCount < 3
                };
            })
        );

        if (requestsWithDetails.length === 0) {
            context.res = {
                status: 200,
                headers: corsHeaders,
                body: {
                    success: true,
                    message: status && status !== 'all'
                        ? `No funding requests found with status: ${status}`
                        : 'No funding requests found',
                    data: {
                        data: [],
                        pagination: {
                            currentPage: page,
                            totalPages: 0,
                            totalCount: 0,
                            pageSize: limit,
                            hasNextPage: false,
                            hasPreviousPage: false
                        },
                        summary: {
                            totalOpen: 0,
                            totalAllotted: 0,
                            totalClosed: 0,
                            total: 0
                        }
                    }
                }
            };
            return;
        }

        // Get summary statistics
        const [openCount, allottedCount, closedCount] = await Promise.all([
            FundingRequest.countDocuments({ status: 'open' }),
            FundingRequest.countDocuments({ status: 'allotted' }),
            FundingRequest.countDocuments({ status: 'closed' })
        ]);

        const totalPages = Math.ceil(totalCount / limit);

        context.res = {
            status: 200,
            headers: corsHeaders,
            body: {
                success: true,
                message: `Found ${totalCount} funding request${totalCount !== 1 ? 's' : ''} (page ${page} of ${totalPages}) - Sorted by status priority`,
                data: {
                    data: requestsWithDetails,
                    pagination: {
                        currentPage: page,
                        totalPages,
                        totalCount,
                        pageSize: limit,
                        hasNextPage: page < totalPages,
                        hasPreviousPage: page > 1
                    },
                    summary: {
                        totalOpen: openCount,
                        totalAllotted: allottedCount,
                        totalClosed: closedCount,
                        total: openCount + allottedCount + closedCount
                    },
                    filters: {
                        status: status || 'all',
                        fundingStage,
                        minAmount,
                        maxAmount
                    },
                    sortInfo: {
                        primarySort: "Status Priority (Open → Allotted → Closed)",
                        secondarySort: `${sortBy} (${sortOrder === 1 ? 'ascending' : 'descending'})`
                    }
                }
            }
        };

    } catch (error) {
        context.log.error('Error fetching funding requests:', error);

        context.res = {
            status: error instanceof ValidationError ? 400 : 500,
            headers: corsHeaders,
            body: {
                success: false,
                message: error.message || 'Failed to fetch funding requests',
                error: process.env.NODE_ENV === 'development' ? error.stack : undefined
            }
        };
    }
}

module.exports = azureFunctionWrapper(getFundingRequestsHandler, {
    requireAuth: false,
    validateInput: null,
    enableCors: true,
    timeout: 20000
});