const HotDeals = require('../../models/hotDeals');
const Deal = require('../../models/deal');
const { ValidationError } = require('../middleware/errorHandler');

class HotDealsService {
  // Initialize hot deals categories (run once)
  static async initializeCategories(createdBy) {
    try {
      const categories = ['public-equities', 'private-equity', 'real-assets', 'private-credit'];
      
      for (const category of categories) {
        const existingCategory = await HotDeals.findOne({ category });
        
        if (!existingCategory) {
          await HotDeals.create({
            category,
            dealIds: [],
            createdBy,
            updatedBy: createdBy
          });
        }
      }
      
      return { message: 'Hot deals categories initialized successfully' };
    } catch (error) {
      throw error;
    }
  }

static async toggleDealInCategory(category, dealId, updatedBy) {
    try {
      // Validate deal exists and is public
      const deal = await Deal.findById(dealId);
      if (!deal) {
        throw new ValidationError('Deal not found');
      }
      
      if (!deal.isPublic) {
        throw new ValidationError('Cannot manage private deal in hot deals');
      }

      if (deal.category !== category) {
        throw new ValidationError(`Deal does not belong to category ${category}`);
      }

      // Find hot deals category
      let hotDealsCategory = await HotDeals.findOne({ category });
      
      if (!hotDealsCategory) {
        // Create category if doesn't exist
        hotDealsCategory = new HotDeals({
          category,
          dealIds: [],
          createdBy: updatedBy,
          updatedBy
        });
      }

      // Check if deal is already in hot deals
      const dealExists = hotDealsCategory.dealIds.some(
        id => id.toString() === dealId.toString()
      );
      
      let action = '';
      
      if (dealExists) {
        // REMOVE: Deal exists, so remove it from hot deals
        hotDealsCategory.dealIds = hotDealsCategory.dealIds.filter(
          id => id.toString() !== dealId.toString()
        );
        
        // Update deal's isHotDeal field to false
        await Deal.findByIdAndUpdate(dealId, { 
          isHotDeal: false,
          updatedAt: new Date()
        });
        
        action = 'removed';
        console.log(`Deal ${dealId} removed from hot deals category ${category}`);
      } else {
        // ADD: Deal doesn't exist, so add it to hot deals
        hotDealsCategory.dealIds.push(dealId);
        
        // Update deal's isHotDeal field to true
        await Deal.findByIdAndUpdate(dealId, { 
          isHotDeal: true,
          updatedAt: new Date()
        });
        
        action = 'added';
        console.log(`Deal ${dealId} added to hot deals category ${category}`);
      }
      
      // Update hot deals category metadata
      hotDealsCategory.updatedBy = updatedBy;
      hotDealsCategory.updatedAt = new Date();
      
      await hotDealsCategory.save();
      
      // Return response with action performed
      const categoryDeals = await this.getCategoryDeals(category);
      
      return {
        success: true,
        action: action, // 'added' or 'removed'
        message: `Deal ${action} ${action === 'added' ? 'to' : 'from'} hot deals successfully`,
        dealId: dealId,
        category: category,
        isHotDeal: action === 'added',
        data: categoryDeals
      };
    } catch (error) {
      console.error('Error in toggleDealInCategory:', error);
      throw error;
    }
  }

  // Helper method to check if deal is in hot deals
  static async isDealInHotDeals(category, dealId) {
    try {
      const hotDealsCategory = await HotDeals.findOne({ category });
      
      if (!hotDealsCategory) {
        return false;
      }
      
      return hotDealsCategory.dealIds.some(
        id => id.toString() === dealId.toString()
      );
    } catch (error) {
      console.error('Error checking deal in hot deals:', error);
      return false;
    }
  }

  // Method to get deal's complete hot deal status
  static async getDealStatus(dealId) {
    try {
      const deal = await Deal.findById(dealId, 'isHotDeal category title company');
      if (!deal) {
        throw new ValidationError('Deal not found');
      }

      // Check if deal is actually in hot deals category
      const isInHotDeals = await this.isDealInHotDeals(deal.category, dealId);

      return {
        dealId,
        title: deal.title,
        company: deal.company,
        category: deal.category,
        isHotDeal: deal.isHotDeal,
        isInHotDealsCategory: isInHotDeals,
        isConsistent: deal.isHotDeal === isInHotDeals
      };
    } catch (error) {
      console.error('Error getting deal status:', error);
      throw error;
    }
  }

  // Get hot deals for specific category
  static async getCategoryDeals(category) {
    try {
      const hotDealsCategory = await HotDeals.findByCategory(category);
      
      if (!hotDealsCategory) {
        throw new ValidationError('Hot deals category not found');
      }

      // Filter out null deals (deleted deals)
      const validDeals = hotDealsCategory.dealIds.filter(deal => deal !== null);
      
      return {
        category: hotDealsCategory.category,
        subcategory: hotDealsCategory.subcategory,
        maxDeals: hotDealsCategory.maxDeals,
        currentDealsCount: validDeals.length,
        deals: validDeals,
        isActive: hotDealsCategory.isActive,
        createdAt: hotDealsCategory.createdAt,
        updatedAt: hotDealsCategory.updatedAt
      };
    } catch (error) {
      throw error;
    }
  }

  // Get all hot deals categories
  static async getAllCategories() {
    try {
      const categories = await HotDeals.getAllActiveCategories();
      
      return categories.map(category => ({
        category: category.category,
        subcategory: category.subcategory,
        maxDeals: category.maxDeals,
        currentDealsCount: category.dealIds.filter(deal => deal !== null).length,
        deals: category.dealIds.filter(deal => deal !== null),
        isActive: category.isActive,
        createdAt: category.createdAt,
        updatedAt: category.updatedAt
      }));
    } catch (error) {
      throw error;
    }
  }

  // Check if deal is in any hot deals category
  static async getDealCategories(dealId) {
    try {
      const categories = await HotDeals.findDealInCategories(dealId);
      
      return categories.map(category => ({
        category: category.category,
        subcategory: category.subcategory
      }));
    } catch (error) {
      throw error;
    }
  }

  // Update category settings (for future dynamic configuration)
  static async updateCategorySettings(category, settings, updatedBy) {
    try {
      const hotDealsCategory = await HotDeals.findOne({ category });
      
      if (!hotDealsCategory) {
        throw new ValidationError('Hot deals category not found');
      }

      // Update allowed settings
      if (settings.maxDeals !== undefined) {
        if (settings.maxDeals < 1 || settings.maxDeals > 10) {
          throw new ValidationError('Max deals must be between 1 and 10');
        }
        hotDealsCategory.maxDeals = settings.maxDeals;
      }

      if (settings.subcategory !== undefined) {
        hotDealsCategory.subcategory = settings.subcategory;
      }

      if (settings.isActive !== undefined) {
        hotDealsCategory.isActive = settings.isActive;
      }

      hotDealsCategory.updatedBy = updatedBy;
      await hotDealsCategory.save();
      
      return await this.getCategoryDeals(category);
    } catch (error) {
      throw error;
    }
  }
}

module.exports = HotDealsService;