const mongoose = require('mongoose');

const OnboardingQuestionSchema = new mongoose.Schema({
  questionId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  category: {
    type: String,
    required: true,
    enum: ['universal', 'public-equities', 'private-equity', 'real-assets', 'private-credit']
  },
  subcategory: {
    type: String,
    trim: true,
    default: null
  },
  question: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  questionType: {
    type: String,
    required: true,
    enum: ['text', 'textarea', 'select', 'multiselect', 'radio', 'checkbox', 'number', 'date', 'file']
  },
  options: [{
    value: {
      type: String,
      required: true
    },
    label: {
      type: String,
      required: true
    }
  }],
  validation: {
    required: {
      type: Boolean,
      default: true
    },
    minLength: {
      type: Number,
      default: 0
    },
    maxLength: {
      type: Number,
      default: 500
    },
    pattern: {
      type: String,
      default: null
    },
    min: {
      type: Number,
      default: null
    },
    max: {
      type: Number,
      default: null
    }
  },
  order: {
    type: Number,
    required: true,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  helpText: {
    type: String,
    trim: true,
    maxlength: 200
  },
  placeholder: {
    type: String,
    trim: true,
    maxlength: 100
  },
  createdBy: {
    type: String,
    required: true,
    trim: true
  },
  updatedBy: {
    type: String,
    required: true,
    trim: true
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
OnboardingQuestionSchema.index({ category: 1, order: 1 });
OnboardingQuestionSchema.index({ questionId: 1 });
OnboardingQuestionSchema.index({ isActive: 1 });
OnboardingQuestionSchema.index({ category: 1, subcategory: 1 });

// Pre-save middleware
OnboardingQuestionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Static methods
OnboardingQuestionSchema.statics.findByCategory = function(category, subcategory = null) {
  const query = { category, isActive: true };
  if (subcategory) {
    query.subcategory = subcategory;
  }
  return this.find(query).sort({ order: 1 });
};

OnboardingQuestionSchema.statics.findActiveQuestions = function() {
  return this.find({ isActive: true }).sort({ category: 1, order: 1 });
};

OnboardingQuestionSchema.statics.getQuestionsByFounderCategory = function(founderCategory) {
  return this.find({
    $or: [
      { category: 'universal' },
      { category: founderCategory }
    ],
    isActive: true
  }).sort({ category: 1, order: 1 });
};

OnboardingQuestionSchema.statics.generateQuestionId = function(category, order) {
  return `${category}_question_${order}`;
};

OnboardingQuestionSchema.statics.getNextOrderForCategory = function(category) {
  return this.findOne({ category }).sort({ order: -1 }).then(lastQuestion => {
    return lastQuestion ? lastQuestion.order + 1 : 1;
  });
};

OnboardingQuestionSchema.statics.getCategoryStats = function() {
  return this.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: '$category',
        totalQuestions: { $sum: 1 },
        questionTypes: { $addToSet: '$questionType' },
        avgOrder: { $avg: '$order' },
        lastUpdated: { $max: '$updatedAt' }
      }
    }
  ]);
};

module.exports = mongoose.model('OnboardingQuestion', OnboardingQuestionSchema);