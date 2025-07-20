const mongoose = require('mongoose');

const FounderOnboardingProgressSchema = new mongoose.Schema({
  founderId: {
    type: String,
    required: true,
    trim: true
  },
  founderCategory: {
    type: String,
    required: true,
    enum: ['public-equities', 'private-equity', 'real-assets', 'private-credit']
  },
  totalQuestions: {
    type: Number,
    required: true,
    default: 0
  },
  completedQuestions: {
    type: Number,
    required: true,
    default: 0
  },
  answeredQuestions: [{
    questionId: {
      type: String,
      required: true
    },
    answer: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },
    answeredAt: {
      type: Date,
      default: Date.now
    },
    skipped: {
      type: Boolean,
      default: false
    }
  }],
  skippedQuestions: [{
    questionId: {
      type: String,
      required: true
    },
    skippedAt: {
      type: Date,
      default: Date.now
    }
  }],
  isCompleted: {
    type: Boolean,
    default: false
  },
  completedAt: {
    type: Date,
    default: null
  },
  progressPercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  sessionData: {
    startedAt: {
      type: Date,
      default: Date.now
    },
    lastUpdatedAt: {
      type: Date,
      default: Date.now
    },
    totalTimeSpent: {
      type: Number,
      default: 0 // in seconds
    }
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
FounderOnboardingProgressSchema.index({ founderId: 1 });
FounderOnboardingProgressSchema.index({ founderCategory: 1 });
FounderOnboardingProgressSchema.index({ isCompleted: 1 });
FounderOnboardingProgressSchema.index({ founderId: 1, founderCategory: 1 }, { unique: true });
FounderOnboardingProgressSchema.index({ 'answeredQuestions.questionId': 1 });
FounderOnboardingProgressSchema.index({ 'skippedQuestions.questionId': 1 });

// Pre-save middleware - only handle timestamps and basic validations
FounderOnboardingProgressSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  this.sessionData.lastUpdatedAt = Date.now();
  next();
});

// Virtual for getting all attempted questions (answered + skipped)
FounderOnboardingProgressSchema.virtual('attemptedQuestions').get(function() {
  return this.answeredQuestions.length + this.skippedQuestions.length;
});

// Ensure virtual fields are serialized
FounderOnboardingProgressSchema.set('toJSON', { virtuals: true });
FounderOnboardingProgressSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('FounderOnboardingProgress', FounderOnboardingProgressSchema);