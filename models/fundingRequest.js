const mongoose = require('mongoose');

const FundingRequestSchema = new mongoose.Schema({
  founderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CompanyProfile',
    required: true
  },
  currency: {
    type: String,
    default: 'USD'
  },
  fundingStage: {
    type: String,
    enum: ['Pre-Seed', 'Seed', 'Series A', 'Series B', 'Series C', 'Series D+', 'Bridge/Convertible', 'Growth/Late Stage'],
    required: true
  },
  equityOffered: {
    type: Number, // percentage
    min: 0,
    max: 100
  },
  useOfFunds: {
    type: String,
    required: true
  },
  businessPlan: {
    type: String
  },
  financialProjections: {
    type: String
  },
  status: {
    type: String,
    enum: ['open', 'allotted', 'closed'],
    default: 'open'
  },
  allottedAt: {
    type: Date
  },
  allottedBy: {
    type: mongoose.Schema.Types.ObjectId
  },
  allotmentMethod: {
    type: String,
    enum: ['manual', 'ai'],
    default: 'manual'
  },
  aiMatchScore: {
    type: Number,
    min: 0,
    max: 100
  },
  additionalNotes: {
    type: String
  },
  // New fields for investor management
  contactedInvestors: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InvestorProfile'
  }],
  totalEmailsSent: {
    type: Number,
    default: 0
  },
  lastEmailSentAt: {
    type: Date
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

// Update the updatedAt field before saving
FundingRequestSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Instance methods for managing investors
FundingRequestSchema.methods.addContactedInvestors = function(investorIds) {
  if (!Array.isArray(investorIds)) {
    investorIds = [investorIds];
  }
  
  // Convert to ObjectIds and filter duplicates
  const newInvestorIds = investorIds
    .map(id => new mongoose.Types.ObjectId(id))
    .filter(id => !this.contactedInvestors.some(existing => existing.equals(id)));
  
  this.contactedInvestors.push(...newInvestorIds);
  return this;
};

FundingRequestSchema.methods.getContactedInvestorsCount = function() {
  return this.contactedInvestors.length;
};

FundingRequestSchema.methods.getTotalEmailsSent = function() {
  return this.totalEmailsSent;
};

// Static methods
FundingRequestSchema.statics.findByFounder = function(founderId) {
  return this.find({ founderId }).populate('contactedInvestors', 'fullName email company');
};

FundingRequestSchema.statics.findActiveByFounder = function(founderId) {
  return this.find({ 
    founderId, 
    status: { $in: ['open', 'allotted'] } 
  }).populate('contactedInvestors', 'fullName email company');
};
// Indexes for better performance
FundingRequestSchema.index({ founderId: 1, status: 1 });
FundingRequestSchema.index({ founderId: 1, createdAt: -1 });
FundingRequestSchema.index({ contactedInvestors: 1 });
FundingRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('FundingRequest', FundingRequestSchema);