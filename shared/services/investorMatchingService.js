const InvestorProfile = require('../../models/sintracapInvestor');
const FounderInvestorMatch = require('../models/FounderInvestorMatch');
const FundingRequest = require('../models/FundingRequest');
const Notification = require('../models/Notification');

class InvestorMatchingService {
    
    /**
     * Calculate match score between a founder and investor
     * @param {Object} founder - Founder/Company profile
     * @param {Object} investor - Investor profile
     * @param {Object} fundingRequest - Funding request details
     * @returns {Object} - Match score and criteria breakdown
     */
    static calculateMatchScore(founder, investor, fundingRequest) {
        let score = 0;
        const criteria = {
            industryMatch: false,
            stageMatch: false,
            amountMatch: false,
            locationMatch: false,
            experienceMatch: false
        };
        
        // Industry match (30% weight)
        if (investor.investmentInterests && founder.industry) {
            const investorInterests = investor.investmentInterests.map(interest => 
                interest.toLowerCase().trim()
            );
            const founderIndustry = founder.industry.toLowerCase().trim();
            
            // Check for exact match or partial match
            const exactMatch = investorInterests.includes(founderIndustry);
            const partialMatch = investorInterests.some(interest => 
                interest.includes(founderIndustry) || founderIndustry.includes(interest)
            );
            
            if (exactMatch) {
                score += 30;
                criteria.industryMatch = true;
            } else if (partialMatch) {
                score += 15;
                criteria.industryMatch = true;
            }
        }
        
        // Stage match (25% weight)
        if (investor.previousInvestments && investor.previousInvestments.length > 0) {
            const investorStages = investor.previousInvestments.map(inv => inv.stage);
            const currentStage = fundingRequest.fundingStage;
            
            // Exact stage match
            if (investorStages.includes(currentStage)) {
                score += 25;
                criteria.stageMatch = true;
            } else {
                // Adjacent stage match (e.g., Seed investor looking at Pre-Seed)
                const stageProgression = [
                    'Pre-Seed', 'Seed', 'Series A', 'Series B', 
                    'Series C', 'Series D+', 'Growth/Late Stage'
                ];
                
                const currentIndex = stageProgression.indexOf(currentStage);
                const hasAdjacentStage = investorStages.some(stage => {
                    const stageIndex = stageProgression.indexOf(stage);
                    return Math.abs(currentIndex - stageIndex) <= 1;
                });
                
                if (hasAdjacentStage) {
                    score += 12;
                    criteria.stageMatch = true;
                }
            }
        }
        
        // Investment amount match (20% weight)
        if (investor.amountRange && fundingRequest.fundingAmount) {
            const ranges = {
                '10K-50K': { min: 10000, max: 50000 },
                '50K-100K': { min: 50000, max: 100000 },
                '100K-500K': { min: 100000, max: 500000 },
                '500K-1M': { min: 500000, max: 1000000 },
                '1M-5M': { min: 1000000, max: 5000000 },
                '5M-10M': { min: 5000000, max: 10000000 },
                '10M+': { min: 10000000, max: Infinity }
            };
            
            const range = ranges[investor.amountRange];
            if (range) {
                const requestAmount = fundingRequest.fundingAmount;
                
                // Perfect range match
                if (requestAmount >= range.min && requestAmount <= range.max) {
                    score += 20;
                    criteria.amountMatch = true;
                } else {
                    // Close range match (within 50% of range boundaries)
                    const tolerance = 0.5;
                    const minWithTolerance = range.min * (1 - tolerance);
                    const maxWithTolerance = range.max * (1 + tolerance);
                    
                    if (requestAmount >= minWithTolerance && requestAmount <= maxWithTolerance) {
                        score += 10;
                        criteria.amountMatch = true;
                    }
                }
            }
        }
        
        // Geographic match (15% weight)
        if (investor.location && founder.address) {
            const investorLocation = investor.location.toLowerCase();
            const founderLocation = founder.address.toLowerCase();
            
            // Extract major location components
            const investorParts = investorLocation.split(',').map(part => part.trim());
            const founderParts = founderLocation.split(',').map(part => part.trim());
            
            // Check for city/state/country matches
            const hasLocationMatch = investorParts.some(investorPart => 
                founderParts.some(founderPart => 
                    investorPart.includes(founderPart) || founderPart.includes(investorPart)
                )
            );
            
            if (hasLocationMatch) {
                score += 15;
                criteria.locationMatch = true;
            }
        }
        
        // Experience and portfolio match (10% weight)
        if (investor.previousInvestments) {
            const investmentCount = investor.previousInvestments.length;
            const hasRelevantExperience = investor.previousInvestments.some(inv => 
                inv.industry && founder.industry && 
                inv.industry.toLowerCase().includes(founder.industry.toLowerCase())
            );
            
            // Experience scoring
            if (investmentCount >= 10 || hasRelevantExperience) {
                score += 10;
                criteria.experienceMatch = true;
            } else if (investmentCount >= 5) {
                score += 7;
                criteria.experienceMatch = true;
            } else if (investmentCount >= 1) {
                score += 3;
                criteria.experienceMatch = true;
            }
        }
        
        return { 
            score: Math.min(Math.round(score), 100), 
            criteria 
        };
    }
    
    /**
     * Get AI-matched investors for a funding request
     * @param {Object} fundingRequest - The funding request
     * @param {Object} founder - The founder's profile
     * @param {number} count - Number of investors to return
     * @param {Array} excludeIds - Investor IDs to exclude
     * @returns {Array} - Scored and sorted investors
     */
    static async getAIMatchedInvestors(fundingRequest, founder, count = 5, excludeIds = []) {
        // Build filter for eligible investors
        const filter = {
            isVerifiedByAdmin: true,
            signupStatus: 'complete',
            _id: { $nin: excludeIds }
        };
        
        // Optional: Pre-filter by investment interests if available
        if (founder.industry) {
            filter.$or = [
                { investmentInterests: { $in: [founder.industry] } },
                { investmentInterests: { $exists: false } }, // Include investors without specified interests
                { investmentInterests: { $size: 0 } }
            ];
        }
        
        // Get all eligible investors
        const allInvestors = await InvestorProfile.find(filter).lean();
        
        if (allInvestors.length === 0) {
            return [];
        }
        
        // Calculate match scores for all investors
        const scoredInvestors = allInvestors.map(investor => {
            const matchResult = this.calculateMatchScore(founder, investor, fundingRequest);
            return {
                investor,
                matchScore: matchResult.score,
                matchCriteria: matchResult.criteria
            };
        });
        
        // Sort by match score (descending) and return top matches
        return scoredInvestors
            .sort((a, b) => {
                // Primary sort: match score
                if (b.matchScore !== a.matchScore) {
                    return b.matchScore - a.matchScore;
                }
                
                // Secondary sort: number of previous investments (experience)
                const aExperience = a.investor.previousInvestments?.length || 0;
                const bExperience = b.investor.previousInvestments?.length || 0;
                return bExperience - aExperience;
            })
            .slice(0, count);
    }
    
    /**
     * Create notifications for funding-related events
     * @param {string} type - Notification type
     * @param {Object} data - Notification data
     * @returns {Object} - Created notification
     */
    static async createFundingNotification(type, data) {
        const notificationTemplates = {
            funding_allotted: {
                title: 'Investors Assigned to Your Funding Request',
                getMessage: (data) => 
                    `Great news! We've assigned ${data.investorCount} investor${data.investorCount > 1 ? 's' : ''} to your funding request for ${data.currency} ${data.amount.toLocaleString()}. You can now view their profiles and start reaching out.`,
                priority: 'high',
                actionText: 'View Assigned Investors'
            },
            funding_refreshed: {
                title: 'Funding Request Refreshed Successfully',
                getMessage: (data) => 
                    `Your funding request has been refreshed and is now open for new investor assignments. You have ${data.remainingRefreshes} refresh${data.remainingRefreshes !== 1 ? 'es' : ''} remaining.`,
                priority: 'medium',
                actionText: 'View Request Status'
            },
            admin_funding_request: {
                title: 'New Funding Request Created',
                getMessage: (data) => 
                    `${data.companyName} has created a new funding request for ${data.currency} ${data.amount.toLocaleString()} at ${data.stage} stage.`,
                priority: 'medium',
                actionText: 'Review Request'
            },
            admin_funding_refreshed: {
                title: 'Funding Request Refreshed',
                getMessage: (data) => 
                    `${data.companyName} has refreshed their funding request (${data.refreshCount}/3 refreshes used). ${data.previousInvestorCount} previous investor assignments were cleared.`,
                priority: 'medium',
                actionText: 'Reassign Investors'
            }
        };
        
        const template = notificationTemplates[type];
        if (!template) {
            throw new Error(`Unknown notification type: ${type}`);
        }
        
        const notification = new Notification({
            recipientId: data.recipientId,
            recipientType: data.recipientType,
            senderId: data.senderId || null,
            senderType: data.senderType || 'system',
            type: type,
            title: template.title,
            message: template.getMessage(data),
            relatedEntityId: data.relatedEntityId,
            relatedEntityType: data.relatedEntityType || 'funding_request',
            priority: template.priority,
            actionUrl: data.actionUrl,
            actionText: template.actionText
        });
        
        return await notification.save();
    }
    
    /**
     * Validate funding request data
     * @param {Object} requestData - Funding request data to validate
     * @returns {Object} - Validation result
     */
    static validateFundingRequestData(requestData) {
        const errors = [];
        const warnings = [];
        
        const { 
            fundingAmount, 
            fundingStage, 
            equityOffered, 
            useOfFunds, 
            businessPlan,
            financialProjections 
        } = requestData;
        
        // Required field validations
        if (!fundingAmount || fundingAmount <= 0) {
            errors.push('Valid funding amount is required');
        }
        
        if (!fundingStage) {
            errors.push('Funding stage is required');
        }
        
        if (!useOfFunds || useOfFunds.trim().length < 10) {
            errors.push('Use of funds description must be at least 10 characters');
        }
        
        // Range validations
        if (equityOffered && (equityOffered < 0 || equityOffered > 100)) {
            errors.push('Equity offered must be between 0 and 100 percent');
        }
        
        if (fundingAmount > 100000000) { // 100M limit
            warnings.push('Large funding amounts may have limited investor matches');
        }
        
        // Stage-amount consistency check
        const stageAmountRanges = {
            'Pre-Seed': { max: 1000000 }, // 1M
            'Seed': { max: 5000000 }, // 5M
            'Series A': { min: 1000000, max: 20000000 }, // 1M - 20M
            'Series B': { min: 10000000, max: 50000000 }, // 10M - 50M
            'Series C': { min: 20000000 } // 20M+
        };
        
        const stageRange = stageAmountRanges[fundingStage];
        if (stageRange) {
            if (stageRange.min && fundingAmount < stageRange.min) {
                warnings.push(`${fundingStage} typically raises more than ${stageRange.min.toLocaleString()}`);
            }
            if (stageRange.max && fundingAmount > stageRange.max) {
                warnings.push(`${fundingStage} typically raises less than ${stageRange.max.toLocaleString()}`);
            }
        }
        
        // Content quality checks
        if (!businessPlan || businessPlan.length < 100) {
            warnings.push('Consider adding a detailed business plan to improve investor matching');
        }
        
        if (!financialProjections) {
            warnings.push('Financial projections can significantly improve your chances with investors');
        }
        
        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }
    
    /**
     * Get match statistics for a founder
     * @param {string} founderId - Founder's ID
     * @returns {Object} - Match statistics
     */
    static async getFounderMatchStatistics(founderId) {
        const matches = await FounderInvestorMatch.aggregate([
            { $match: { founderId: founderId } },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    avgMatchScore: { $avg: '$matchScore' }
                }
            }
        ]);
        
        const totalMatches = await FounderInvestorMatch.countDocuments({ founderId });
        const activeFundingRequests = await FundingRequest.countDocuments({ 
            founderId, 
            status: { $in: ['open', 'allotted'] } 
        });
        
        const statistics = {
            totalMatches,
            activeFundingRequests,
            statusBreakdown: {},
            averageMatchScore: 0
        };
        
        let totalScore = 0;
        matches.forEach(match => {
            statistics.statusBreakdown[match._id] = {
                count: match.count,
                averageScore: Math.round(match.avgMatchScore || 0)
            };
            totalScore += match.avgMatchScore * match.count;
        });
        
        if (totalMatches > 0) {
            statistics.averageMatchScore = Math.round(totalScore / totalMatches);
        }
        
        return statistics;
    }
}

module.exports = InvestorMatchingService;