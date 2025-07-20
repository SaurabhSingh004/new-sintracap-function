const mongoose = require('mongoose');

const InvestmentSchema = new mongoose.Schema({
  companyName: String,
  industry: String,
  stage: String,
  amountInvested: Number,
  year: Number,
  status: {
    type: String,
    enum: ['Active', 'Exited', 'IPO', 'Acquired'],
  },
  website: String,
  logoURL: String,
});

// Contact history schema for tracking communications with this investor
const ContactHistorySchema = new mongoose.Schema({
  contactType: {
    type: String,
    enum: ['pitch_deck_sent', 'follow_up', 'meeting_scheduled', 'investment_interest', 'declined', 'other'],
    required: true
  },
  subject: String,
  message: String,
  fundingRequestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FundingRequest'
  },
  sentById: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CompanyProfile' // or User model
  },
  sentAt: {
    type: Date,
    default: Date.now
  },
  responseReceived: {
    type: Boolean,
    default: false
  },
  responseDate: Date,
  responseNote: String
});

const InvestorProfileSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true,
    trim: true,
  },
  password: {
    type: String
  },
  photoURL: String,
  email: {
    type: String,
    required: true,
    lowercase: true,
    unique: true
  },
  phone: String,
  linkedIn: String,
  company: String, 
  designation: String, 
  bio: String,
  location: String,
  investmentInterests: [String],
  amountRange: {
    type: String
  },
  role: {
    type: String,
    default: 'investor'
  },
  fetchedFromCSV: {
    type: Boolean,
    default: true
  },
  previousInvestments: [InvestmentSchema],
  notableExits: [String],
  isVerifiedByAdmin: {
    type: Boolean,
    default: false,
  },
  documents: {
    type: [{
      documentId: String,
      name: String,
      url: String,
      uploadedAt: {
        type: Date,
        default: Date.now
      },
      isVerified: {
        type: Boolean,
        default: false
      }
    }],
    default: [],
    required: false
  },
  requestedDocuments: {
    type: [{
      documentId: String,
      name: String,
      docType: String,
      requestedAt: {
        type: Date,
        default: Date.now
      },
    }],
    default: [],
    required: false
  },
  provider: {
    type: String,
    enum: ['google', 'linkedin', 'email'],
    default: 'email',
  },
  signupStatus: {
    type: String,
    enum: ['pre-signup', 'role-selected', 'complete'],
    default: 'pre-signup'
  },
  agreedToTerms: Boolean,
  emailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: {
    type: String,
    default: null
  },
  emailVerificationExpires: {
    type: Date,
    default: null
  },
  linkedIn: {
    type: String,
    default: null
  },
  // New field for contact history
  contactHistory: [ContactHistorySchema],
  
  // Statistics fields
  totalContactsReceived: {
    type: Number,
    default: 0
  },
  lastContactedAt: {
    type: Date
  },
  
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update the updatedAt field before saving
InvestorProfileSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Instance methods
InvestorProfileSchema.methods.addContactHistory = function(contactType, subject, message, fundingRequestId, sentById) {
  this.contactHistory.push({
    contactType,
    subject,
    message,
    fundingRequestId,
    sentById
  });
  this.totalContactsReceived += 1;
  this.lastContactedAt = new Date();
  return this;
};

InvestorProfileSchema.methods.getRecentContacts = function(limit = 10) {
  return this.contactHistory
    .sort((a, b) => b.sentAt - a.sentAt)
    .slice(0, limit);
};

// Static methods
InvestorProfileSchema.statics.findContactableInvestors = function(criteria = {}) {
  const query = {
    email: { $exists: true, $ne: null, $ne: '' },
    emailVerified: true,
    signupStatus: 'complete',
    ...criteria
  };
  
  return this.find(query);
};

InvestorProfileSchema.statics.findByInvestmentInterests = function(interests) {
  return this.find({
    investmentInterests: { $in: interests },
    email: { $exists: true, $ne: null, $ne: '' },
    emailVerified: true,
    signupStatus: 'complete'
  });
};

// Indexes for better performance
InvestorProfileSchema.index({ email: 1 });
InvestorProfileSchema.index({ investmentInterests: 1 });
InvestorProfileSchema.index({ location: 1 });
InvestorProfileSchema.index({ amountRange: 1 });
InvestorProfileSchema.index({ isVerifiedByAdmin: 1, emailVerified: 1 });
InvestorProfileSchema.index({ 'contactHistory.fundingRequestId': 1 });

module.exports = mongoose.model('InvestorProfile', InvestorProfileSchema);