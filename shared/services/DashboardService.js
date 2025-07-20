// services/dashboardService.js
const FundingRequest = require('../../models/fundingRequest');
const CompanyProfile = require('../../models/sintracapFounder');
const InvestorProfile = require('../../models/sintracapInvestor');
const FounderInvestorMatch = require('../../models/founderInvestorMatch');

class DashboardService {
  // Get number of investors, founders, and funding requests
  static async getMetrics() {
    const [investors, founders, fundingRequests, investorFounderMatches] = await Promise.all([
      InvestorProfile.countDocuments(),
      CompanyProfile.countDocuments(),
      FundingRequest.countDocuments(),
      FounderInvestorMatch.countDocuments()
    ]);

    return {
      totalInvestors: investors,
      totalFounders: founders,
      totalFundingRequests: fundingRequests,
      totalInvestorFounderMatches: investorFounderMatches
    };
  }

  // Get recent activities related to deal flows and investor-founder matchings
  static async getRecentActivities() {
    const recentDealFlows = await FundingRequest.aggregate([
      {
        $sort: { createdAt: -1 }
      },
      {
        $limit: 5
      },
      {
        $project: {
          title: 1,
          description: 1,
          createdAt: 1
        }
      }
    ]);

    const recentInvestorMatches = await FounderInvestorMatch.aggregate([
      {
        $sort: { createdAt: -1 }
      },
      {
        $limit: 5
      },
      {
        $lookup: {
          from: 'companyprofiles',
          localField: 'founderId',
          foreignField: '_id',
          as: 'founder'
        }
      },
      {
        $unwind: '$founder'
      },
      {
        $project: {
          'founder.companyName': 1,
          createdAt: 1,
          investorId: 1
        }
      }
    ]);

    return {
      recentDealFlows,
      recentInvestorMatches
    };
  }

  // Combine everything into one function for the dashboard
  static async getDashboardData() {
    const metrics = await this.getMetrics();
    const activities = await this.getRecentActivities();

    return {
      success: true,
      message: 'Dashboard data fetched successfully',
      data: {
        metrics,
        activities
      }
    };
  }
}

module.exports = DashboardService;
