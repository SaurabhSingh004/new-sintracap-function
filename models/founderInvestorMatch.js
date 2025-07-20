const mongoose = require('mongoose');

const FounderInvestorMatchSchema = new mongoose.Schema({
  fundingRequestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FundingRequest',
    required: true
  },
  founderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CompanyProfile',
    required: true
  },
  investorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InvestorProfile',
    required: true
  },
  emailSent: {
    type: Boolean,
    default: false
  },
  emailSentAt: {
    type: Date
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId
  },
  assignmentMethod: {
    type: String,
    enum: ['manual', 'ai'],
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'contacted', 'interested', 'declined', 'funded'],
    default: 'active'
  },
  contactedAt: {
    type: Date
  },
  responseAt: {
    type: Date
  },
  notes: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index to ensure unique founder-investor pairs per funding request
FounderInvestorMatchSchema.index({ 
  fundingRequestId: 1, 
  founderId: 1, 
  investorId: 1 
}, { unique: true });

module.exports = mongoose.model('FounderInvestorMatch', FounderInvestorMatchSchema);