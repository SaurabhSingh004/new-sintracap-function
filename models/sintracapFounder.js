const mongoose = require('mongoose');

const FinancialsSchema = new mongoose.Schema({
  year: Number,
  revenue: Number,
  profit: Number,
  burnRate: Number,
  valuation: Number,
});
const CompanyProfileSchema = new mongoose.Schema({
  companyName: {
    type: String,
    required: true,
    trim: true,
  },
  logoURL: String,
  password: {
    type: String
  },
  description: {
    type: String,
  },
  industry: {
    type: String,
  },
  sector: String,
  foundedDate: Date,
  fundingStage: {
    type: String,
    enum: ['Idea/Concept',
      'Stealth',
      'MVP Development',
      'Bootstrap/Self-Funded',
      'Pre-Revenue',
      'Angel/Friends & Family',
      'Pre-Seed',
      'Seed',
      'Series A',
      'Series B',
      'Series C',
      'Series D+',
      'Bridge/Convertible',
      'Growth/Late Stage',
      'Pre-IPO',
      'Public Company',
      'Profitable/Self-Sustaining',
      'Acquisition/Exit',
      'Serial Entrepreneur'],
  },
  teamSize: String,
  provider: {
    type: String,
    enum: ['google', 'linkedin', 'email'],
    default: 'email',
  },
  providerId: {
    type: String
  },
  fundingRaised: {
    amount: Number,
    currency: { type: String, default: 'USD' },
    rounds: [
      {
        roundType: String,
        amount: Number,
        date: Date,
        leadInvestor: String,
      },
    ],
  },
  website: String,
  phone: String,
  email: {
    type: String,
    required: true,
    lowercase: true,
    unique: true
  },
  address: String,
  agreedToTerms: Boolean,
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
  pitchDeckDocuments: {
    type: [{
      documentId: String,
      name: String,
      url: String,
      uploadedAt: {
        type: Date,
        default: Date.now
      },
      isActive: {
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
  role: {
    type: String,
    default: 'founder'
  },
  financials: [FinancialsSchema],
  isVerifiedByAdmin: {
    type: Boolean,
    default: false,
  },
  linkedIn: {
    type: String,
    default: null
  },
  signupStatus: {
    type: String,
    enum: ['pre-signup', 'role-selected', 'complete'],
    default: 'pre-signup'
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  category: {
    type: String,
    required: false,
    enum: ['public-equities', 'private-equity', 'real-assets', 'private-credit']
  },
  subcategory: {
    type: String,
    required: false,
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
  emailVerificationToken: {
    type: String,
    default: null
  },
  emailVerificationExpires: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('CompanyProfile', CompanyProfileSchema);