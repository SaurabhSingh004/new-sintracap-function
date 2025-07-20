const OnboardingQuestion = require('../../models/onboardingQuestion');
const FounderOnboardingProgress = require('../../models/founderOnboardingProgress');
const { ValidationError } = require('../middleware/errorHandler');
const mongoose = require('mongoose');

class OnboardingService {
  // ==================== QUESTION MANAGEMENT ====================
  
  // Add question to specific category
  static async addQuestionToCategory(category, questionData, createdBy) {
    try {
      // Validate question data
      this.validateQuestionData(questionData);
      
      // Generate unique question ID if not provided
      const existingQuestions = await OnboardingQuestion.find({ category }).sort({ order: -1 });
      const nextOrder = questionData.order || (existingQuestions.length > 0 ? existingQuestions[0].order + 1 : 1);
      
      const questionId = questionData.questionId || OnboardingQuestion.generateQuestionId(category, nextOrder);
      
      // Check if question ID already exists
      const existingQuestion = await OnboardingQuestion.findOne({ questionId });
      if (existingQuestion) {
        throw new ValidationError(`Question with ID ${questionId} already exists`);
      }

      const newQuestion = await OnboardingQuestion.create({
        ...questionData,
        questionId,
        category,
        order: nextOrder,
        createdBy,
        updatedBy: createdBy
      });

      // Update total questions count for all founders in this category
      await this.updateTotalQuestionsForCategory(category);

      return newQuestion;
    } catch (error) {
      throw error;
    }
  }

  // Remove question from category
  static async removeQuestionFromCategory(questionId, updatedBy) {
    try {
      const question = await OnboardingQuestion.findOne({ _id: questionId });
      
      if (!question) {
        throw new ValidationError('Question not found');
      }

      const category = question.category;
      
      // Soft delete by setting isActive to false
      await OnboardingQuestion.updateOne(
        { _id: questionId },
        { 
          isActive: false,
          updatedBy: updatedBy,
          updatedAt: new Date()
        }
      );

      // Update total questions count for all founders in this category
      await this.updateTotalQuestionsForCategory(category);

      return { message: 'Question removed successfully' };
    } catch (error) {
      throw error;
    }
  }

  // Update question
  static async updateQuestion(questionId, updateData, updatedBy) {
    try {
      const question = await OnboardingQuestion.findOne({ _id: questionId });
      
      if (!question) {
        throw new ValidationError('Question not found');
      }

      // Validate updated data if question type or options are being changed
      if (updateData.questionType || updateData.options) {
        const dataToValidate = { ...question.toObject(), ...updateData };
        this.validateQuestionData(dataToValidate);
      }

      // Update allowed fields
      const allowedFields = [
        'question', 'questionType', 'options', 'validation', 
        'order', 'helpText', 'placeholder', 'isActive', 'subcategory'
      ];
      
      const updateFields = {};
      allowedFields.forEach(field => {
        if (updateData[field] !== undefined) {
          updateFields[field] = updateData[field];
        }
      });

      updateFields.updatedBy = updatedBy;
      updateFields.updatedAt = new Date();

      const updatedQuestion = await OnboardingQuestion.findOneAndUpdate(
        { _id: questionId },
        updateFields,
        { new: true, runValidators: true }
      );

      // Update total questions count if isActive was changed
      if (updateData.isActive !== undefined) {
        await this.updateTotalQuestionsForCategory(question.category);
      }

      return updatedQuestion;
    } catch (error) {
      throw error;
    }
  }

  // Get questions for specific category
  static async getQuestionsByCategory(category, subcategory = null) {
    try {
      const questions = await OnboardingQuestion.findByCategory(category, subcategory);
      return questions;
    } catch (error) {
      throw error;
    }
  }

  // Get all questions for founder based on their category
  static async getFounderOnboardingQuestions(founderCategory) {
    try {
      const questions = await OnboardingQuestion.getQuestionsByFounderCategory(founderCategory);
      return questions;
    } catch (error) {
      throw error;
    }
  }

  // Get all active questions
  static async getAllActiveQuestions() {
    try {
      const questions = await OnboardingQuestion.findActiveQuestions();
      return questions;
    } catch (error) {
      throw error;
    }
  }

  // ==================== FOUNDER PROGRESS MANAGEMENT ====================

  // Initialize founder onboarding progress
  static async initializeFounderProgress(founderId, founderCategory, founderSubcategory = null) {
    try {
      // Check if progress already exists
      const existingProgress = await FounderOnboardingProgress.findOne({ founderId });
      if (existingProgress) {
        // Update total questions count in case new questions were added
        const totalQuestions = await this.getTotalQuestionsForCategory(founderCategory);
        
        await FounderOnboardingProgress.updateOne(
          { founderId },
          { totalQuestions }
        );
        
        return await FounderOnboardingProgress.findOne({ founderId });
      }

      // Get total questions count for the founder's category
      const totalQuestions = await this.getTotalQuestionsForCategory(founderCategory);

      const progress = await FounderOnboardingProgress.create({
        founderId,
        founderCategory,
        totalQuestions
      });

      return progress;
    } catch (error) {
      throw error;
    }
  }

  // Add or update answer for a question
  static async addAnswer(founderId, questionId, answer, skipped = false) {
    try {
      // Validate inputs
      if (!founderId || !questionId) {
        throw new ValidationError('Founder ID and Question ID are required');
      }

      // Find founder's progress
      const progress = await FounderOnboardingProgress.findOne({ founderId });
      if (!progress) {
        throw new ValidationError('Founder onboarding progress not found. Please initialize first.');
      }

      // Validate question exists and belongs to founder's category
      const question = await OnboardingQuestion.findOne({ 
        _id: questionId, 
        isActive: true,
        $or: [
          { category: 'universal' },
          { category: progress.founderCategory }
        ]
      });

      if (!question) {
        throw new ValidationError('Question not found or does not belong to founder\'s category');
      }

      // Remove existing answer/skip for this question
      await FounderOnboardingProgress.updateOne(
        { founderId },
        {
          $pull: {
            answeredQuestions: { questionId: questionId },
            skippedQuestions: { questionId: questionId }
          }
        }
      );

      // Add new answer or skip
      const updateOperation = skipped ? {
        $push: {
          skippedQuestions: {
            questionId: questionId,
            skippedAt: new Date()
          }
        }
      } : {
        $push: {
          answeredQuestions: {
            questionId: questionId,
            answer: answer,
            answeredAt: new Date(),
            skipped: false
          }
        }
      };

      await FounderOnboardingProgress.updateOne({ founderId }, updateOperation);

      // Recalculate and update progress
      await this.updateProgressCalculations(founderId);

      return await FounderOnboardingProgress.findOne({ founderId });
    } catch (error) {
      throw error;
    }
  }

  // Answer a question (wrapper for addAnswer)
  static async answerQuestion(founderId, questionId, answer, skipped = false) {
    return await this.addAnswer(founderId, questionId, answer, skipped);
  }

  // Reset founder onboarding
  static async resetOnboarding(founderId) {
    try {
      const progress = await FounderOnboardingProgress.findOne({ founderId });
      if (!progress) {
        throw new ValidationError('Founder onboarding progress not found');
      }

      // Get updated total questions count
      const totalQuestions = await this.getTotalQuestionsForCategory(progress.founderCategory);

      // Reset all progress data
      const resetData = {
        completedQuestions: 0,
        answeredQuestions: [],
        skippedQuestions: [],
        isCompleted: false,
        completedAt: null,
        progressPercentage: 0,
        totalQuestions: totalQuestions,
        'sessionData.startedAt': new Date(),
        'sessionData.totalTimeSpent': 0,
        updatedAt: new Date()
      };

      await FounderOnboardingProgress.updateOne({ founderId }, resetData);

      return await FounderOnboardingProgress.findOne({ founderId });
    } catch (error) {
      throw error;
    }
  }

  // Get answer by question ID
  static async getAnswerByQuestionId(founderId, questionId) {
    try {
      const progress = await FounderOnboardingProgress.findOne(
        { founderId },
        { answeredQuestions: { $elemMatch: { questionId: questionId } } }
      );

      return progress?.answeredQuestions?.[0] || null;
    } catch (error) {
      throw error;
    }
  }

  // Check if question is answered
  static async isQuestionAnswered(founderId, questionId) {
    try {
      console.log("Checking if question is answered:", founderId, questionId);
      const progress = await FounderOnboardingProgress.findOne({
        founderId,
        'answeredQuestions.questionId': questionId
      });

      return !!progress;
    } catch (error) {
      throw error;
    }
  }

  // Check if question is skipped
  static async isQuestionSkipped(founderId, questionId) {
    try {
      const progress = await FounderOnboardingProgress.findOne({
        founderId,
        'skippedQuestions.questionId': questionId
      });

      return !!progress;
    } catch (error) {
      throw error;
    }
  }

  // Get founder progress
  static async getFounderProgress(founderId) {
    try {
      const progress = await FounderOnboardingProgress.findOne({ founderId });
      
      if (!progress) {
        throw new ValidationError('Founder onboarding progress not found');
      }

      return progress;
    } catch (error) {
      throw error;
    }
  }

  // Update progress calculations (completion percentage, completion status)
  static async updateProgressCalculations(founderId) {
    try {
      const progress = await FounderOnboardingProgress.findOne({ founderId });
      if (!progress) {
        throw new ValidationError('Founder progress not found');
      }

      const completedQuestions = progress.answeredQuestions.length;
      const progressPercentage = progress.totalQuestions > 0 
        ? Math.round((completedQuestions / progress.totalQuestions) * 100) 
        : 0;
      
      const isCompleted = completedQuestions >= progress.totalQuestions;
      const updateData = {
        completedQuestions,
        progressPercentage,
        isCompleted,
        updatedAt: new Date()
      };

      // Set completion date if just completed
      if (isCompleted && !progress.isCompleted) {
        updateData.completedAt = new Date();
      }

      await FounderOnboardingProgress.updateOne({ founderId }, updateData);

      return updateData;
    } catch (error) {
      throw error;
    }
  }

  // Get founder onboarding data with questions and answers
  static async getFounderOnboardingData(founderId) {
    try {
      const progress = await FounderOnboardingProgress.findOne({ founderId });
      
      if (!progress) {
        throw new ValidationError('Founder onboarding progress not found');
      }

      const questions = await OnboardingQuestion.getQuestionsByFounderCategory(progress.founderCategory);

      const questionsWithAnswers = await Promise.all(
        questions.map(async (question) => {
          const answer = await this.getAnswerByQuestionId(founderId, question._id);
          const isAnswered = await this.isQuestionAnswered(founderId, question._id);
          const isSkipped = await this.isQuestionSkipped(founderId, question._id);

          return {
            ...question.toObject(),
            answer: answer?.answer || null,
            isAnswered,
            isSkipped,
            answeredAt: answer?.answeredAt || null
          };
        })
      );

      return {
        progress: progress.toObject(),
        questions: questionsWithAnswers
      };
    } catch (error) {
      throw error;
    }
  }

  // Bulk answer multiple questions
  static async bulkAnswerQuestions(founderId, answers) {
    try {
      const results = [];
      
      // Use transaction for bulk operations
      const session = await mongoose.startSession();
      
      try {
        await session.withTransaction(async () => {
          for (const answerData of answers) {
            const { questionId, answer, skipped = false } = answerData;
            
            if (!questionId) {
              results.push({
                questionId: questionId || 'unknown',
                success: false,
                error: 'Question ID is required'
              });
              continue;
            }
            
            try {
              await this.addAnswer(founderId, questionId, answer, skipped);
              results.push({
                questionId,
                success: true
              });
            } catch (error) {
              results.push({
                questionId,
                success: false,
                error: error.message
              });
            }
          }
        });
      } finally {
        await session.endSession();
      }
      
      return { results };
    } catch (error) {
      throw error;
    }
  }

  // Get current step question
  static async getCurrentStepQuestion(founderId, step) {
    try {
      const progress = await FounderOnboardingProgress.findOne({ founderId });
      
      if (!progress) {
        throw new ValidationError('Founder onboarding progress not found');
      }

      const questions = await OnboardingQuestion.getQuestionsByFounderCategory(progress.founderCategory);
      
      // Get question for specific step (step - 1 because array is 0-indexed)
      const questionIndex = step - 1;
      
      if (questionIndex >= questions.length || questionIndex < 0) {
        throw new ValidationError('Invalid step number');
      }
      
      const question = questions[questionIndex];
      const answer = await this.getAnswerByQuestionId(founderId, question._id);
      const isAnswered = await this.isQuestionAnswered(founderId, question._id);
      const isSkipped = await this.isQuestionSkipped(founderId, question._id);
      
      return {
        totalSteps: questions.length,
        question: {
          ...question.toObject(),
          answer: answer?.answer || null,
          isAnswered,
          isSkipped,
          answeredAt: answer?.answeredAt || null
        },
        progress: {
          progressPercentage: progress.progressPercentage,
          completedQuestions: progress.completedQuestions,
          totalQuestions: progress.totalQuestions,
          isCompleted: progress.isCompleted
        }
      };
    } catch (error) {
      throw error;
    }
  }

  // ==================== ANALYTICS AND STATISTICS ====================

  // Get onboarding completion statistics
  static async getCompletionStats(founderCategory = null) {
    try {
      const matchStage = founderCategory ? { founderCategory } : {};
      
      const stats = await FounderOnboardingProgress.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: '$founderCategory',
            totalFounders: { $sum: 1 },
            completedFounders: {
              $sum: { $cond: [{ $eq: ['$isCompleted', true] }, 1, 0] }
            },
            avgProgress: { $avg: '$progressPercentage' },
            avgTimeSpent: { $avg: '$sessionData.totalTimeSpent' },
            avgCompletedQuestions: { $avg: '$completedQuestions' },
            avgTotalQuestions: { $avg: '$totalQuestions' }
          }
        }
      ]);

      return stats;
    } catch (error) {
      throw error;
    }
  }

  // Get question analytics
  static async getQuestionAnalytics() {
    try {
      const questionStats = await OnboardingQuestion.getCategoryStats();
      
      const answerStats = await FounderOnboardingProgress.aggregate([
        { $unwind: '$answeredQuestions' },
        {
          $group: {
            _id: '$answeredQuestions.questionId',
            totalAnswered: { $sum: 1 },
            categories: { $addToSet: '$founderCategory' },
            avgAnswerTime: { $avg: '$answeredQuestions.answeredAt' }
          }
        },
        { $sort: { totalAnswered: -1 } }
      ]);

      const skipStats = await FounderOnboardingProgress.aggregate([
        { $unwind: '$skippedQuestions' },
        {
          $group: {
            _id: '$skippedQuestions.questionId',
            totalSkipped: { $sum: 1 },
            categories: { $addToSet: '$founderCategory' }
          }
        },
        { $sort: { totalSkipped: -1 } }
      ]);

      return {
        categoryStats: questionStats,
        answerStats: answerStats,
        skipStats: skipStats
      };
    } catch (error) {
      throw error;
    }
  }

  // Get incomplete onboarding founders
  static async getIncompleteOnboardingFounders() {
    try {
      const incompleteFounders = await FounderOnboardingProgress.find({ 
        isCompleted: false,
        'sessionData.lastUpdatedAt': { 
          $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days ago
        }
      }).sort({ 'sessionData.lastUpdatedAt': -1 });

      return incompleteFounders;
    } catch (error) {
      throw error;
    }
  }

  // Get system overview
  static async getSystemOverview() {
    try {
      const totalQuestions = await OnboardingQuestion.countDocuments({ isActive: true });
      const totalFounders = await FounderOnboardingProgress.countDocuments();
      const completedFounders = await FounderOnboardingProgress.countDocuments({ isCompleted: true });
      const categoryStats = await OnboardingQuestion.getCategoryStats();
      const completionStats = await this.getCompletionStats();

      return {
        totalQuestions,
        totalFounders,
        completedFounders,
        completionRate: totalFounders > 0 ? (completedFounders / totalFounders) * 100 : 0,
        categoryStats,
        completionStats
      };
    } catch (error) {
      throw error;
    }
  }

  // ==================== UTILITY METHODS ====================

  // Update total questions count for all founders in a category
  static async updateTotalQuestionsForCategory(category) {
    try {
      const totalQuestions = await this.getTotalQuestionsForCategory(category);

      // Update all founders in this category
      await FounderOnboardingProgress.updateMany(
        { founderCategory: category },
        { totalQuestions: totalQuestions }
      );

      return { message: 'Total questions updated for all founders in category' };
    } catch (error) {
      throw error;
    }
  }

  // Get total questions count for a category
  static async getTotalQuestionsForCategory(category) {
    try {
      const totalQuestions = await OnboardingQuestion.countDocuments({
        $or: [
          { category: 'universal' },
          { category: category }
        ],
        isActive: true
      });

      return totalQuestions;
    } catch (error) {
      throw error;
    }
  }

  // Get questions by multiple filters
  static async getQuestionsByFilters(filters) {
    try {
      const query = { isActive: true };
      
      if (filters.category) {
        query.category = filters.category;
      }
      
      if (filters.subcategory) {
        query.subcategory = filters.subcategory;
      }
      
      if (filters.questionType) {
        query.questionType = filters.questionType;
      }
      
      const questions = await OnboardingQuestion.find(query).sort({ category: 1, order: 1 });
      return questions;
    } catch (error) {
      throw error;
    }
  }

  // Delete question permanently (for admin use)
  static async deleteQuestionPermanently(questionId, deletedBy) {
    try {
      const question = await OnboardingQuestion.findOne({ questionId });
      
      if (!question) {
        throw new ValidationError('Question not found');
      }

      const category = question.category;
      
      // Check if any founder has answered this question
      const foundersWithAnswers = await FounderOnboardingProgress.findOne({
        'answeredQuestions.questionId': questionId
      });
      
      if (foundersWithAnswers) {
        throw new ValidationError('Cannot delete question as it has been answered by founders');
      }

      // Delete the question
      await OnboardingQuestion.deleteOne({ questionId });

      // Update total questions count for all founders in this category
      await this.updateTotalQuestionsForCategory(category);

      return { message: 'Question deleted permanently' };
    } catch (error) {
      throw error;
    }
  }

  // Reorder questions within a category
  static async reorderQuestions(category, questionOrders, updatedBy) {
    try {
      const session = await mongoose.startSession();
      
      await session.withTransaction(async () => {
        for (const { questionId, order } of questionOrders) {
          await OnboardingQuestion.updateOne(
            { questionId, category },
            { 
              order: order,
              updatedBy: updatedBy,
              updatedAt: new Date()
            }
          );
        }
      });

      await session.endSession();
      return { message: 'Questions reordered successfully' };
    } catch (error) {
      throw error;
    }
  }

  // Validate question data
  static validateQuestionData(questionData) {
    const requiredFields = ['question', 'questionType'];
    const validQuestionTypes = ['text', 'textarea', 'select', 'multiselect', 'radio', 'checkbox', 'number', 'date', 'file'];
    
    for (const field of requiredFields) {
      if (!questionData[field]) {
        throw new ValidationError(`${field} is required`);
      }
    }

    if (!validQuestionTypes.includes(questionData.questionType)) {
      throw new ValidationError(`Invalid question type. Valid types: ${validQuestionTypes.join(', ')}`);
    }

    // Validate options for select/multiselect/radio/checkbox
    if (['select', 'multiselect', 'radio', 'checkbox'].includes(questionData.questionType)) {
      if (!questionData.options || !Array.isArray(questionData.options) || questionData.options.length === 0) {
        throw new ValidationError(`Options are required for ${questionData.questionType} questions`);
      }

      for (const option of questionData.options) {
        if (!option.value || !option.label) {
          throw new ValidationError('Each option must have value and label');
        }
      }
    }

    return true;
  }

  // Get next available order for category
  static async getNextOrderForCategory(category) {
    try {
      const lastQuestion = await OnboardingQuestion.findOne({ category }).sort({ order: -1 });
      return lastQuestion ? lastQuestion.order + 1 : 1;
    } catch (error) {
      throw error;
    }
  }

  // Update session time spent
  static async updateSessionTimeSpent(founderId, additionalTime) {
    try {
      await FounderOnboardingProgress.updateOne(
        { founderId },
        { 
          $inc: { 'sessionData.totalTimeSpent': additionalTime },
          $set: { 
            'sessionData.lastUpdatedAt': new Date(),
            updatedAt: new Date()
          }
        }
      );

      return { message: 'Session time updated successfully' };
    } catch (error) {
      throw error;
    }
  }

  // Get founder progress summary
  static async getFounderProgressSummary(founderId) {
    try {
      const progress = await FounderOnboardingProgress.findOne({ founderId });
      
      if (!progress) {
        throw new ValidationError('Founder onboarding progress not found');
      }

      const summary = {
        founderId: progress.founderId,
        founderCategory: progress.founderCategory,
        progressPercentage: progress.progressPercentage,
        completedQuestions: progress.completedQuestions,
        totalQuestions: progress.totalQuestions,
        isCompleted: progress.isCompleted,
        completedAt: progress.completedAt,
        answeredQuestionsCount: progress.answeredQuestions.length,
        skippedQuestionsCount: progress.skippedQuestions.length,
        sessionData: progress.sessionData,
        createdAt: progress.createdAt,
        updatedAt: progress.updatedAt
      };

      return summary;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = OnboardingService;