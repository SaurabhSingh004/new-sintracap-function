const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  recipientType: {
    type: String,
    enum: ['founder', 'investor', 'admin'],
    required: true
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null // null for system notifications
  },
  senderType: {
    type: String,
    enum: ['founder', 'investor', 'admin', 'system'],
    default: 'system'
  },
  type: {
    type: String,
    enum: [
      'funding_allotted',
      'funding_refreshed',
      'funding_request_created',
      'funding_request_deleted', // Added new enum
      'document_requested',
      'document_verified',
      'profile_verified',
      'general',
      'investors_assigned'
    ],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  relatedEntityId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null // Could be fundingRequestId, matchId, etc.
  },
  relatedEntityType: {
    type: String,
    enum: ['funding_request', 'match', 'document', 'profile'],
    default: null
  },
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  actionUrl: {
    type: String // Frontend URL for action button
  },
  actionText: {
    type: String // Text for action button
  },
  expiresAt: {
    type: Date // For time-sensitive notifications
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for efficient querying
NotificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 }); // Auto-delete after 30 days

module.exports = mongoose.model('Notification', NotificationSchema);