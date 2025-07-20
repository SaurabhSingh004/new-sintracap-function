// searchInvestors/index.js - Search Investors with CORS handling
const {
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const dbConfig = require('../shared/config/db.config');
const InvestorProfile = require('../models/sintracapInvestor');

// Main function handler
async function searchInvestorsHandler(context, req) {
    // Handle CORS preflight request
    if (req.method === 'OPTIONS') {
        context.res = {
            status: 200,
            headers: {
                'Access-Control-Allow-Origin': '*', // Update this to your domain in production
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-ms-client-request-id',
                'Access-Control-Max-Age': '86400'
            },
            body: null
        };
        return;
    }

    // Set CORS headers for actual requests
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*', // Update this to your domain in production
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-ms-client-request-id',
        "Content-Type": "application/json"
    };

    try {
        // Ensure database connection
        await ensureDbConnection(dbConfig, context);

        // Optional authentication - uncomment if auth is required
        // const authenticatedUser = await authenticateToken(context, req);
        // if (!authenticatedUser) {
        //     return; // Response already set by authenticateToken middleware
        // }

        // Extract query parameters
        const searchQuery = req.query.search || '';
        const isVerified = req.query.isVerified; // 'true', 'false', or undefined for all
        const fromCSV = req.query.fromCSV; // 'true', 'false', or undefined for all
        const company = req.query.company;
        const location = req.query.location;
        const designation = req.query.designation;
        const investmentInterests = req.query.investmentInterests;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const sortBy = req.query.sortBy || 'createdAt';
        const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

        // Validate pagination parameters
        if (page < 1) {
            throw new ValidationError('Page number must be greater than 0');
        }

        if (limit < 1 || limit > 100) {
            throw new ValidationError('Limit must be between 1 and 100');
        }

        // Validate sortBy field
        const allowedSortFields = ['fullName', 'email', 'company', 'designation', 'location', 'createdAt', 'updatedAt'];
        if (!allowedSortFields.includes(sortBy)) {
            throw new ValidationError(`Invalid sortBy field. Allowed fields: ${allowedSortFields.join(', ')}`);
        }

        // Build query filter
        const filter = {};

        // General search across multiple fields using regex
        if (searchQuery.trim()) {
            const searchRegex = new RegExp(searchQuery.trim(), 'i'); // Case insensitive
            filter.$or = [
                { fullName: searchRegex },
                { email: searchRegex },
                { company: searchRegex },
                { designation: searchRegex },
                { location: searchRegex },
                { bio: searchRegex },
                { investmentInterests: { $in: [searchRegex] } }
            ];
        }

        // Specific field filters
        if (isVerified !== undefined) {
            filter.isVerifiedByAdmin = isVerified === 'true';
        }

        if (fromCSV !== undefined) {
            filter.fetchedFromCSV = fromCSV === 'true';
        }

        if (company) {
            filter.company = new RegExp(company.trim(), 'i');
        }

        if (location) {
            filter.location = new RegExp(location.trim(), 'i');
        }

        if (designation) {
            filter.designation = new RegExp(designation.trim(), 'i');
        }

        if (investmentInterests) {
            const interestsArray = investmentInterests.split(',').map(interest => interest.trim());
            filter.investmentInterests = { 
                $in: interestsArray.map(interest => new RegExp(interest, 'i'))
            };
        }

        // Calculate skip value for pagination
        const skip = (page - 1) * limit;

        // Build sort object
        const sort = {};
        sort[sortBy] = sortOrder;

        // Get total count for pagination
        const totalCount = await InvestorProfile.countDocuments(filter);

        // Define fields to include (exclude sensitive/auth fields)
        const projection = {
            fullName: 1,
            email: 1,
            phone: 1,
            linkedIn: 1,
            company: 1,
            designation: 1,
            bio: 1,
            location: 1,
            investmentInterests: 1,
            amountRange: 1,
            previousInvestments: 1,
            notableExits: 1,
            isVerifiedByAdmin: 1,
            photoURL: 1,
            fetchedFromCSV: 1,
            role: 1,
            createdAt: 1,
            updatedAt: 1
            // Excluded: password, emailVerificationToken, emailVerificationExpires, 
            // agreedToTerms, emailVerified, provider, signupStatus, documents, requestedDocuments
        };

        // Fetch investors with pagination and filtering
        const investors = await InvestorProfile.find(filter, projection)
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .lean();

        // Transform the data to ensure clean response
        const transformedInvestors = investors.map(investor => ({
            id: investor._id,
            fullName: investor.fullName,
            email: investor.email,
            phone: investor.phone || null,
            linkedIn: investor.linkedIn || null,
            company: investor.company || null,
            designation: investor.designation || null,
            bio: investor.bio || null,
            location: investor.location || null,
            investmentInterests: investor.investmentInterests || [],
            amountRange: investor.amountRange || null,
            previousInvestments: investor.previousInvestments || [],
            notableExits: investor.notableExits || [],
            isVerifiedByAdmin: investor.isVerifiedByAdmin || false,
            photoURL: investor.photoURL || null,
            fetchedFromCSV: investor.fetchedFromCSV || false,
            role: investor.role,
            createdAt: investor.createdAt,
            updatedAt: investor.updatedAt
        }));

        if (transformedInvestors.length === 0) {
            context.res = {
                status: 200,
                headers: corsHeaders,
                body: {
                    success: true,
                    message: searchQuery 
                        ? `No investors found matching search: "${searchQuery}"`
                        : 'No investors found',
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
                            totalVerified: 0,
                            totalUnverified: 0,
                            totalFromCSV: 0,
                            totalManual: 0,
                            total: 0
                        }
                    }
                }
            };
            return;
        }

        // Get summary statistics
        const [verifiedCount, unverifiedCount, csvCount, manualCount] = await Promise.all([
            InvestorProfile.countDocuments({ isVerifiedByAdmin: true }),
            InvestorProfile.countDocuments({ isVerifiedByAdmin: false }),
            InvestorProfile.countDocuments({ fetchedFromCSV: true }),
            InvestorProfile.countDocuments({ fetchedFromCSV: false })
        ]);

        const totalPages = Math.ceil(totalCount / limit);

        context.res = {
            status: 200,
            headers: corsHeaders,
            body: {
                success: true,
                message: `Found ${totalCount} investor${totalCount !== 1 ? 's' : ''} (page ${page} of ${totalPages})`,
                data: {
                    data: transformedInvestors,
                    pagination: {
                        currentPage: page,
                        totalPages,
                        totalCount,
                        pageSize: limit,
                        hasNextPage: page < totalPages,
                        hasPreviousPage: page > 1
                    },
                    summary: {
                        totalVerified: verifiedCount,
                        totalUnverified: unverifiedCount,
                        totalFromCSV: csvCount,
                        totalManual: manualCount,
                        total: verifiedCount + unverifiedCount
                    },
                    filters: {
                        search: searchQuery || null,
                        isVerified: isVerified || null,
                        fromCSV: fromCSV || null,
                        company: company || null,
                        location: location || null,
                        designation: designation || null,
                        investmentInterests: investmentInterests || null
                    }
                }
            }
        };

    } catch (error) {
        context.log.error('Error searching investors:', error);

        context.res = {
            status: error instanceof ValidationError ? 400 : 500,
            headers: corsHeaders,
            body: {
                success: false,
                message: error.message || 'Failed to search investors',
                error: process.env.NODE_ENV === 'development' ? error.stack : undefined
            }
        };
    }
}

// Export wrapped function
module.exports = azureFunctionWrapper(searchInvestorsHandler, {
    requireAuth: false, // Set to true if authentication is required
    validateInput: null,
    enableCors: true,
    timeout: 20000
});