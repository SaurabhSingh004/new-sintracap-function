const Deal = require('../../models/deal');
const { ValidationError } = require('../middleware/errorHandler');

class DealsService {
  // Create a new deal
  static async createDeal(dealData, createdBy) {
    try {
      // Validate only the truly required fields based on the schema
      const requiredFields = ['title', 'category', 'subcategory'];
      const missingFields = requiredFields.filter(field => !dealData[field]);
      
      if (missingFields.length > 0) {
        throw new ValidationError(`Missing required fields: ${missingFields.join(', ')}`);
      }

      // Process amount if provided and it's a string
      if (dealData.amount && typeof dealData.amount === 'string') {
        dealData.amount = {
          displayText: dealData.amount,
          value: this.extractNumericValue(dealData.amount),
          currency: this.extractCurrency(dealData.amount)
        };
      }

      // Process minInvestment if provided and it's a string
      if (dealData.minInvestment && typeof dealData.minInvestment === 'string') {
        dealData.minInvestment = {
          displayText: dealData.minInvestment,
          value: this.extractNumericValue(dealData.minInvestment),
          currency: this.extractCurrency(dealData.minInvestment)
        };
      }

      const deal = new Deal({
        ...dealData,
        createdBy
      });

      await deal.save();
      return await this.getDealById(deal._id, createdBy);
    } catch (error) {
      if (error.name === 'ValidationError') {
        throw new ValidationError(`Validation failed: ${Object.values(error.errors).map(e => e.message).join(', ')}`);
      }
      throw error;
    }
  }

  // Update an existing deal
  static async updateDeal(dealId, updateData) {
    try {
      const deal = await Deal.findById(dealId);
      
      if (!deal) {
        throw new ValidationError('Deal not found');
      }

      // Process amount and minInvestment if they're being updated as strings
      if (updateData.amount && typeof updateData.amount === 'string') {
        updateData.amount = {
          displayText: updateData.amount,
          value: this.extractNumericValue(updateData.amount),
          currency: this.extractCurrency(updateData.amount)
        };
      }

      if (updateData.minInvestment && typeof updateData.minInvestment === 'string') {
        updateData.minInvestment = {
          displayText: updateData.minInvestment,
          value: this.extractNumericValue(updateData.minInvestment),
          currency: this.extractCurrency(updateData.minInvestment)
        };
      }

      Object.assign(deal, updateData);
      
      await deal.save();
      return await this.getDealById(dealId);
    } catch (error) {
      if (error.name === 'ValidationError') {
        throw new ValidationError(`Validation failed: ${Object.values(error.errors).map(e => e.message).join(', ')}`);
      }
      throw error;
    }
  }

  // Delete a deal
  static async deleteDeal(dealId, deletedBy) {
    try {
      const deal = await Deal.findById(dealId);
      
      if (!deal) {
        throw new ValidationError('Deal not found');
      }

      // Soft delete or hard delete based on requirements
      await Deal.findByIdAndDelete(dealId);
      
      return { message: 'Deal deleted successfully', dealId };
    } catch (error) {
      throw error;
    }
  }

  // Get single deal by ID
  static async getDealById(dealId, userId = null) {
    try {
      const deal = await Deal.findById(dealId)
        .populate('createdBy', 'fullName email')
        .lean();

      if (!deal) {
        throw new ValidationError('Deal not found');
      }

      // Check if deal is public or user has access
      if (!deal.isPublic && userId) {
        // Add role-based access logic here if needed
      }

      // Increment view count if not the creator viewing their own deal
      if (userId && deal.createdBy.toString() !== userId.toString()) {
        await Deal.findByIdAndUpdate(dealId, {
          $inc: { 'analytics.viewCount': 1 },
          $set: { 'analytics.lastViewed': new Date() }
        });
      }

      return deal;
    } catch (error) {
      throw error;
    }
  }

  // Get all deals with filters
  static async getAllDeals(filters = {}) {
    try {
      const {
        category,
        subcategory,
        status,
        adminSelected,
        isHotDeal,
        search,
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = filters;

      const query = { isPublic: true };

      // Apply filters
      if (category) query.category = category;
      if (subcategory) query.subcategory = subcategory;
      if (status) {
        if (Array.isArray(status)) {
          query.status = { $in: status };
        } else {
          query.status = status;
        }
      }
      if (adminSelected !== undefined) query.adminSelected = adminSelected;
      if (isHotDeal !== undefined) query.isHotDeal = isHotDeal;

      // Search functionality
      if (search) {
        query.$or = [
          { title: { $regex: search, $options: 'i' } },
          { company: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { tags: { $regex: search, $options: 'i' } }
        ];
      }

      // Pagination
      const skip = (page - 1) * limit;
      const sortOptions = {};
      sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

      const [deals, totalCount] = await Promise.all([
        Deal.find(query)
          .populate('createdBy', 'fullName email')
          .sort(sortOptions)
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        Deal.countDocuments(query)
      ]);

      const totalPages = Math.ceil(totalCount / limit);

      return {
        deals,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCount,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      };
    } catch (error) {
      throw error;
    }
  }

  // Get deals by category
  static async getDealsByCategory(category, subcategory = null, limit = 10) {
    try {
      return await Deal.findByCategory(category, subcategory).limit(limit);
    } catch (error) {
      throw error;
    }
  }

  // Toggle admin selected status
  static async toggleAdminSelected(dealId) {
    try {
      const deal = await Deal.findById(dealId);
      
      if (!deal) {
        throw new ValidationError('Deal not found');
      }

      deal.adminSelected = !deal.adminSelected;
      
      await deal.save();
      return deal;
    } catch (error) {
      throw error;
    }
  }

  // Add media to deal
  static async addDealMedia(dealId, mediaData, uploadedBy) {
    try {
      const deal = await Deal.findById(dealId);
      
      if (!deal) {
        throw new ValidationError('Deal not found');
      }

      const media = {
        ...mediaData,
        uploadedBy
      };

      deal.addMedia(media);
      await deal.save();
      
      return deal;
    } catch (error) {
      throw error;
    }
  }

  // Remove media from deal
  static async removeDealMedia(dealId, mediaId, userId) {
    try {
      const deal = await Deal.findById(dealId);
      
      if (!deal) {
        throw new ValidationError('Deal not found');
      }

      deal.removeMedia(mediaId);
      await deal.save();
      
      return deal;
    } catch (error) {
      throw error;
    }
  }

  // Utility methods
  static extractNumericValue(displayText) {
    // Extract numeric value from display text like "₹500 Cr", "$100M"
    const numericPart = displayText.replace(/[^\d.,]/g, '');
    const value = parseFloat(numericPart.replace(/,/g, ''));
    
    // Handle Cr (Crore), L (Lakh), M (Million), B (Billion) etc.
    if (displayText.toLowerCase().includes('cr')) {
      return value * 10000000; // 1 Crore = 10 Million
    } else if (displayText.toLowerCase().includes('l')) {
      return value * 100000; // 1 Lakh = 100,000
    } else if (displayText.toLowerCase().includes('m')) {
      return value * 1000000; // 1 Million
    } else if (displayText.toLowerCase().includes('b')) {
      return value * 1000000000; // 1 Billion
    }
    
    return value || 0;
  }

  static extractCurrency(displayText) {
    if (displayText.includes('₹')) return 'INR';
    if (displayText.includes('$')) return 'USD';
    if (displayText.includes('€')) return 'EUR';
    if (displayText.includes('£')) return 'GBP';
    return 'INR'; // Default
  }

  // Analytics methods
  static async getDealAnalytics(dealId) {
    try {
      const deal = await Deal.findById(dealId).select('analytics title company');
      
      if (!deal) {
        throw new ValidationError('Deal not found');
      }

      return deal.analytics;
    } catch (error) {
      throw error;
    }
  }

  static async incrementDealInterest(dealId) {
    try {
      const deal = await Deal.findById(dealId);
      
      if (!deal) {
        throw new ValidationError('Deal not found');
      }

      await deal.incrementInterest();
      return deal.analytics;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = DealsService;