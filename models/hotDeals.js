const mongoose = require('mongoose');

const HotDealsSchema = new mongoose.Schema({
  category: {
    type: String,
    required: true,
    enum: ['public-equities', 'private-equity', 'real-assets', 'private-credit'],
    unique: true
  },
  subcategory: {
    type: String,
    required: false,
    trim: true
  },
  dealIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Deal',
    required: true
  }],
  maxDeals: {
    type: Number,
    default: 3,
    min: 1,
    max: 10
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: String,
    required: true
  },
  updatedBy: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes
HotDealsSchema.index({ category: 1 });
HotDealsSchema.index({ isActive: 1 });
HotDealsSchema.index({ dealIds: 1 });

// Validation: Ensure max deals limit
HotDealsSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Ensure max deals limit
  if (this.dealIds.length > this.maxDeals) {
    return next(new Error(`Cannot add more than ${this.maxDeals} deals to this category`));
  }
  
  next();
});

// Instance methods
HotDealsSchema.methods.addDeal = function(dealId) {
  // Check if deal already exists
  const dealExists = this.dealIds.some(id => id.toString() === dealId.toString());
  if (dealExists) {
    throw new Error('Deal already exists in this hot deals category');
  }
  
  // Check max deals limit
  if (this.dealIds.length >= this.maxDeals) {
    throw new Error(`Cannot add more than ${this.maxDeals} deals to this category`);
  }
  
  this.dealIds.push(dealId);
  return this;
};

HotDealsSchema.methods.removeDeal = function(dealId) {
  const dealIndex = this.dealIds.findIndex(id => id.toString() === dealId.toString());
  
  if (dealIndex === -1) {
    throw new Error('Deal not found in this hot deals category');
  }
  
  this.dealIds.splice(dealIndex, 1);
  return this;
};

// Static methods
HotDealsSchema.statics.findByCategory = function(category) {
  return this.findOne({ category, isActive: true })
    .populate({
      path: 'dealIds',
      model: 'Deal',
      match: { isPublic: true },
      select: 'title company category subcategory amount type status duration returns minInvestment description adminSelected priority analytics'
    })
    .populate('createdBy updatedBy', 'fullName email');
};

HotDealsSchema.statics.getAllActiveCategories = function() {
  return this.find({ isActive: true })
    .populate({
      path: 'dealIds',
      model: 'Deal',
      match: { isPublic: true, status: { $in: ['Active', 'Pipeline', 'Closing Soon'] } },
      select: 'title company category subcategory amount type status duration returns minInvestment description adminSelected priority analytics'
    })
    .populate('createdBy updatedBy', 'fullName email');
};

HotDealsSchema.statics.findDealInCategories = function(dealId) {
  return this.find({
    dealIds: dealId,
    isActive: true
  });
};

module.exports = mongoose.model('HotDeals', HotDealsSchema);