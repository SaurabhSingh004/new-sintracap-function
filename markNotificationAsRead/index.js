// markNotificationAsRead/index.js
const {
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const AuthService = require('../shared/services/authService');
const dbConfig = require('../shared/config/db.config');
const Notification = require('../models/notification');

// Main function handler
async function markNotificationAsReadHandler(context, req) {
    // Ensure database connection
    await ensureDbConnection(dbConfig, context);
    
    // Get authenticated user
    const user = await AuthService.authenticate(req);
    
    if (!user) {
        throw new ValidationError('Authentication required');
    }
    
    // Get notification ID from route parameter
    const notificationId = context.bindingData.notificationId;
    
    if (!notificationId) {
        throw new ValidationError('Notification ID is required');
    }
    
    // Check if it's a bulk operation
    const { markAll = false, type, priority } = req.body;
    
    try {
        if (markAll) {
            // Mark all notifications as read for the user
            const filter = {
                recipientId: user._id,
                recipientType: user.role,
                isRead: false
            };
            
            // Add optional filters for bulk operation
            if (type) {
                filter.type = type;
            }
            
            if (priority) {
                filter.priority = priority;
            }
            
            // Filter out expired notifications
            filter.$or = [
                { expiresAt: { $exists: false } },
                { expiresAt: null },
                { expiresAt: { $gt: new Date() } }
            ];
            
            const result = await Notification.updateMany(
                filter,
                {
                    $set: {
                        isRead: true,
                        readAt: new Date()
                    }
                }
            );
            
            return {
                message: `Marked ${result.modifiedCount} notification${result.modifiedCount !== 1 ? 's' : ''} as read`,
                data: {
                    operation: 'bulk_mark_read',
                    modifiedCount: result.modifiedCount,
                    filters: { type, priority }
                }
            };
            
        } else if (notificationId === 'all') {
            // Handle the route /notifications/all/read for marking all as read
            const filter = {
                recipientId: user._id,
                recipientType: user.role,
                isRead: false
            };
            
            // Filter out expired notifications
            filter.$or = [
                { expiresAt: { $exists: false } },
                { expiresAt: null },
                { expiresAt: { $gt: new Date() } }
            ];
            
            const result = await Notification.updateMany(
                filter,
                {
                    $set: {
                        isRead: true,
                        readAt: new Date()
                    }
                }
            );
            
            return {
                message: `Marked all ${result.modifiedCount} notification${result.modifiedCount !== 1 ? 's' : ''} as read`,
                data: {
                    operation: 'mark_all_read',
                    modifiedCount: result.modifiedCount
                }
            };
            
        } else {
            // Mark single notification as read
            const notification = await Notification.findOne({
                _id: notificationId,
                recipientId: user._id,
                recipientType: user.role
            });
            
            if (!notification) {
                throw new ValidationError('Notification not found or access denied');
            }
            
            // Check if notification is expired
            if (notification.expiresAt && notification.expiresAt < new Date()) {
                throw new ValidationError('Cannot mark expired notification as read');
            }
            
            // Check if already read
            if (notification.isRead) {
                return {
                    message: 'Notification is already marked as read',
                    data: {
                        notification: {
                            _id: notification._id,
                            title: notification.title,
                            isRead: notification.isRead,
                            readAt: notification.readAt
                        }
                    }
                };
            }
            
            // Mark as read
            notification.isRead = true;
            notification.readAt = new Date();
            await notification.save();
            
            // Get updated unread count for user
            const unreadCount = await Notification.countDocuments({
                recipientId: user._id,
                recipientType: user.role,
                isRead: false,
                $or: [
                    { expiresAt: { $exists: false } },
                    { expiresAt: null },
                    { expiresAt: { $gt: new Date() } }
                ]
            });
            
            return {
                message: 'Notification marked as read successfully',
                data: {
                    notification: {
                        _id: notification._id,
                        title: notification.title,
                        type: notification.type,
                        priority: notification.priority,
                        isRead: notification.isRead,
                        readAt: notification.readAt,
                        createdAt: notification.createdAt
                    },
                    userStats: {
                        remainingUnreadCount: unreadCount
                    }
                }
            };
        }
        
    } catch (error) {
        context.log.error('Error marking notification as read:', error);
        
        if (error instanceof ValidationError) {
            throw error;
        }
        
        throw new Error('Failed to mark notification as read');
    }
}

// Export wrapped function
module.exports = azureFunctionWrapper(markNotificationAsReadHandler, {
    requireAuth: true,
    validateInput: null,
    enableCors: true,
    timeout: 10000
});