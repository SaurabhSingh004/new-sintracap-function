const mongoose = require('mongoose');

const DealMediaSchema = new mongoose.Schema({
  name: {
    type: String,
    required: false,
    trim: true
  },
  path: {
    type: String,
    required: false
  },
  type: {
    type: String,
    enum: ['image', 'video', 'document'],
    required: false
  },
  size: {
    type: Number, // in bytes
    required: false
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  }
});

const DealSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  company: {
    type: String,
    required: false,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    required: false,
    maxlength: 1000
  },
  category: {
    type: String,
    required: true,
    enum: ['public-equities', 'private-equity', 'real-assets', 'private-credit']
  },
  subcategory: {
    type: String,
    required: true,
    validate: {
      validator: function(value) {
        const subcategoryMap = {
          'public-equities': [
            'Pre-IPO/IPO',
            'Secondary',
            'QIPs & Private Placement',
            'Take-Private'
          ],
          'private-equity': [
            'Corporates',
            'Technology (Zomato-like)',
            'Financial Services',
            'Industrials',
            'Healthcare',
            'Communication Services',
            'Venture Stage'
          ],
          'real-assets': [
            'Real Estate',
            'Industrial Warehousing',
            'Office',
            'Residential',
            'Retail & Hospitality',
            'Infrastructure Delivery Capabilities',
            'Renewable (Solar, Wind, etc.)',
            'Power & ESG',
            'Roads',
            'Circular Economy'
          ],
          'private-credit': [
            'Senior Debt',
            'Management Buyout',
            'Special Situations Investments',
            'NPL (Non-Performing Loans)'
          ]
        };
        return subcategoryMap[this.category]?.includes(value);
      },
      message: 'Invalid subcategory for the selected category'
    }
  },
  amount: {
    value: {
      type: Number,
      required: false,
      min: 0
    },
    currency: {
      type: String,
      default: 'INR',
      enum: ['INR', 'USD', 'EUR', 'GBP']
    },
    displayText: {
      type: String,
      required: false // e.g., "₹500 Cr"
    }
  },
  type: {
    type: String,
    required: false,
    trim: true,
    maxlength: 50
  },
  status: {
    type: String,
    required: false,
    enum: ['Active', 'Pipeline', 'Closing Soon', 'Closed', 'Suspended'],
    default: 'Pipeline'
  },
  duration: {
    type: String,
    required: false,
    trim: true,
    maxlength: 50
  },
  returns: {
    type: String,
    required: false,
    trim: true,
    maxlength: 50
  },
  minInvestment: {
    value: {
      type: Number,
      required: false,
      min: 0
    },
    currency: {
      type: String,
      default: 'INR',
      enum: ['INR', 'USD', 'EUR', 'GBP']
    },
    displayText: {
      type: String,
      required: false // e.g., "₹5 Cr"
    }
  },
  adminSelected: {
    type: Boolean,
    default: false
  },
  isHotDeal: {
    type: Boolean,
    default: false
  },
  dealMedias: [DealMediaSchema],
  tags: [{
    type: String,
    trim: true,
    maxlength: 50
  }],
  isPublic: {
    type: Boolean,
    default: true
  },
  targetInvestors: [{
    type: String,
    enum: ['HNI', 'Family Office', 'Institutional', 'Retail', 'Angel', 'VC', 'PE']
  }],
  geography: {
    type: String,
    trim: true,
    maxlength: 100
  },
  riskLevel: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Very High'],
    default: 'Medium'
  },
  compliance: {
    regulatoryApproval: {
      type: Boolean,
      default: false
    },
    documents: [{
      name: String,
      path: String,
      uploadedAt: {
        type: Date,
        default: Date.now
      }
    }]
  },
  analytics: {
    viewCount: {
      type: Number,
      default: 0
    },
    interestCount: {
      type: Number,
      default: 0
    },
    lastViewed: Date
  },
  createdBy: {
    type: String,
    trim: true,
    required: false
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

// Indexes for better performance
DealSchema.index({ category: 1, subcategory: 1 });
DealSchema.index({ status: 1 });
DealSchema.index({ adminSelected: 1 });
DealSchema.index({ createdAt: -1 });
DealSchema.index({ 'amount.value': 1 });
DealSchema.index({ tags: 1 });
DealSchema.index({ targetInvestors: 1 });

// Pre-save middleware
DealSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Instance methods
DealSchema.methods.incrementView = function() {
  this.analytics.viewCount += 1;
  this.analytics.lastViewed = new Date();
  return this.save();
};

DealSchema.methods.incrementInterest = function() {
  this.analytics.interestCount += 1;
  return this.save();
};

DealSchema.methods.addMedia = function(mediaData) {
  this.dealMedias.push(mediaData);
  return this;
};

DealSchema.methods.removeMedia = function(mediaId) {
  this.dealMedias.pull(mediaId);
  return this;
};

// Static methods
DealSchema.statics.findByCategory = function(category, subcategory = null) {
  const query = { category, isPublic: true };
  if (subcategory) {
    query.subcategory = subcategory;
  }
  return this.find(query).sort({ createdAt: -1 });
};

DealSchema.statics.findActiveDeals = function() {
  return this.find({ 
    status: { $in: ['Active', 'Closing Soon'] },
    isPublic: true
  }).sort({ createdAt: -1 });
};

DealSchema.statics.searchDeals = function(searchTerm, filters = {}) {
  const query = {
    isPublic: true,
    $or: [
      { title: { $regex: searchTerm, $options: 'i' } },
      { company: { $regex: searchTerm, $options: 'i' } },
      { description: { $regex: searchTerm, $options: 'i' } },
      { tags: { $regex: searchTerm, $options: 'i' } }
    ],
    ...filters
  };
  
  return this.find(query).sort({ createdAt: -1 });
};

module.exports = mongoose.model('Deal', DealSchema);