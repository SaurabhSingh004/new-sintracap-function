// getNotifications/index.js
const {
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const AuthService = require('../shared/services/authService');
const dbConfig = require('../shared/config/db.config');
const Notification = require('../models/notification');

// Main function handler
async function getNotificationsHandler(context, req) {
    // Ensure database connection
    await ensureDbConnection(dbConfig, context);
    
    // Get authenticated user
    const user = await AuthService.authenticate(req);
    
    if (!user) {
        throw new ValidationError('Authentication required');
    }
    
    // Extract query parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const isRead = req.query.isRead; // 'true', 'false', or undefined for all
    const type = req.query.type; // Filter by notification type
    const priority = req.query.priority; // Filter by priority
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    
    // Validate pagination parameters
    if (page < 1) {
        throw new ValidationError('Page number must be greater than 0');
    }
    
    if (limit < 1 || limit > 100) {
        throw new ValidationError('Limit must be between 1 and 100');
    }
    
    // Build filter query
    const filter = {
        recipientId: user._id,
        recipientType: user.role
    };
    
    // Add optional filters
    if (isRead !== undefined) {
        if (isRead === 'true') {
            filter.isRead = true;
        } else if (isRead === 'false') {
            filter.isRead = false;
        }
    }
    
    if (type) {
        const validTypes = [
            'funding_allotted', 'funding_refreshed', 'investor_assigned',
            'funding_request_created', 'document_requested', 'document_verified',
            'profile_verified', 'general'
        ];
        if (validTypes.includes(type)) {
            filter.type = type;
        } else {
            throw new ValidationError(`Invalid notification type. Valid types: ${validTypes.join(', ')}`);
        }
    }
    
    if (priority) {
        const validPriorities = ['low', 'medium', 'high', 'urgent'];
        if (validPriorities.includes(priority)) {
            filter.priority = priority;
        } else {
            throw new ValidationError(`Invalid priority. Valid priorities: ${validPriorities.join(', ')}`);
        }
    }
    
    // Filter out expired notifications
    filter.$or = [
        { expiresAt: { $exists: false } },
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } }
    ];
    
    // Calculate skip for pagination
    const skip = (page - 1) * limit;
    
    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder;
    
    try {
        // Get total count
        const totalCount = await Notification.countDocuments(filter);
        
        // Get unread count
        const unreadCount = await Notification.countDocuments({
            ...filter,
            isRead: false
        });
        
        if (totalCount === 0) {
            return {
                message: 'No notifications found',
                data: {
                    notifications: [],
                    pagination: {
                        currentPage: page,
                        totalPages: 0,
                        totalCount: 0,
                        pageSize: limit,
                        hasNextPage: false,
                        hasPreviousPage: false
                    },
                    summary: {
                        total: 0,
                        unread: 0,
                        read: 0
                    }
                }
            };
        }
        
        // Fetch notifications
        const notifications = await Notification.find(filter)
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .lean();
        
        // Format notifications for response
        const formattedNotifications = notifications.map(notification => ({
            _id: notification._id,
            type: notification.type,
            title: notification.title,
            message: notification.message,
            priority: notification.priority,
            isRead: notification.isRead,
            readAt: notification.readAt,
            actionUrl: notification.actionUrl,
            actionText: notification.actionText,
            relatedEntityId: notification.relatedEntityId,
            relatedEntityType: notification.relatedEntityType,
            createdAt: notification.createdAt,
            expiresAt: notification.expiresAt,
            sender: notification.senderType !== 'system' ? {
                type: notification.senderType,
                id: notification.senderId
            } : null,
            timeAgo: getTimeAgo(notification.createdAt),
            isExpired: notification.expiresAt && notification.expiresAt < new Date()
        }));
        
        // Get summary by type and priority
        const [typeSummary, prioritySummary] = await Promise.all([
            Notification.aggregate([
                { $match: filter },
                { $group: { _id: '$type', count: { $sum: 1 } } }
            ]),
            Notification.aggregate([
                { $match: filter },
                { $group: { _id: '$priority', count: { $sum: 1 } } }
            ])
        ]);
        
        const typeBreakdown = {};
        typeSummary.forEach(item => {
            typeBreakdown[item._id] = item.count;
        });
        
        const priorityBreakdown = {};
        prioritySummary.forEach(item => {
            priorityBreakdown[item._id] = item.count;
        });
        
        const totalPages = Math.ceil(totalCount / limit);
        
        return {
            message: `Found ${totalCount} notification${totalCount !== 1 ? 's' : ''} (page ${page} of ${totalPages})`,
            data: {
                notifications: formattedNotifications,
                pagination: {
                    currentPage: page,
                    totalPages,
                    totalCount,
                    pageSize: limit,
                    hasNextPage: page < totalPages,
                    hasPreviousPage: page > 1
                },
                summary: {
                    total: totalCount,
                    unread: unreadCount,
                    read: totalCount - unreadCount,
                    typeBreakdown,
                    priorityBreakdown
                },
                filters: {
                    isRead,
                    type,
                    priority,
                    sortBy,
                    sortOrder: sortOrder === 1 ? 'asc' : 'desc'
                }
            }
        };
        
    } catch (error) {
        context.log.error('Error fetching notifications:', error);
        throw new Error('Failed to fetch notifications');
    }
}

// Helper function to calculate time ago
function getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - new Date(date);
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffSecs < 60) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`;
    return new Date(date).toLocaleDateString();
}

// Export wrapped function
module.exports = azureFunctionWrapper(getNotificationsHandler, {
    requireAuth: true,
    validateInput: null,
    enableCors: true,
    timeout: 15000
});