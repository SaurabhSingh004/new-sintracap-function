// shared/config/constants.js
module.exports = {
  // JWT Configuration
  JWT_SECRET: process.env.JWT_SECRET || "ca51115b3649b930af268e54aa42c1d273eecbcba63a2ac8d199e0333a0d2706",
  JWT_EXPIRE: process.env.JWT_EXPIRE || '30d',
  
  // Email Configuration
  EMAIL_FROM: process.env.EMAIL_FROM || "himanshu@actofit.com",
  HOST_PASS: process.env.HOST_PASS || "lxcd fqtv xtpf zxen",
  
  // LinkedIn OAuth Configuration
  LINKEDIN_CLIENT_ID: process.env.LINKEDIN_CLIENT_ID || '86yfv12jlk4udi',
  LINKEDIN_CLIENT_SECRET: process.env.LINKEDIN_CLIENT_SECRET || 'WPL_AP1.NoBYiQ67C1jTiIR0.N+xZ1Q==',
  LINKEDIN_REDIRECT_URI: process.env.LINKEDIN_REDIRECT_URI || 'http://localhost:7071/api/linkedin-callback',
  
  // Frontend URLs
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
  
  // API Configuration
  API_VERSION: 'v1',
  
  // Application Configuration
  APP_NAME: 'SintraCap',
  
  // Admin Configuration
  ADMIN_EMAILS: process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(',') : ['sintracap@admin.com', 'admin@sintracap.com'],
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'Test@123',
  
  // Roles
  ROLES: {
    INVESTOR: 'investor',
    FOUNDER: 'founder',
    ADMIN: 'admin'
  },
  
  // Status
  SIGNUP_STATUS: {
    PRE_SIGNUP: 'pre-signup',
    ROLE_SELECTED: 'role-selected',
    COMPLETE: 'complete'
  },
  
  // Document Status
  DOCUMENT_STATUS: {
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected'
  },
  
  // Rate Limiting
  RATE_LIMIT: {
    WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW) || 900000, // 15 minutes
    MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100
  },
  
  // Timeouts (in milliseconds)
  TIMEOUTS: {
    DEFAULT: 30000,
    AUTH: 15000,
    UPLOAD: 60000,
    AI_PROCESSING: 90000,
    EMAIL: 20000
  },
  
  // Validation
  VALIDATION: {
    MIN_PASSWORD_LENGTH: 8,
    MAX_PASSWORD_LENGTH: 128,
    MIN_NAME_LENGTH: 2,
    MAX_NAME_LENGTH: 100,
    MIN_PHONE_LENGTH: 10,
    MAX_PHONE_LENGTH: 20
  },
  
  // Error Messages
  ERRORS: {
    UNAUTHORIZED: 'Unauthorized access',
    NOT_FOUND: 'Resource not found',
    VALIDATION_FAILED: 'Validation failed',
    SERVER_ERROR: 'Internal server error',
    EMAIL_REQUIRED: 'Email is required',
    PASSWORD_REQUIRED: 'Password is required',
    INVALID_EMAIL: 'Invalid email format',
    INVALID_ROLE: 'Invalid role specified',
    EMAIL_ALREADY_EXISTS: 'Email already registered',
    USER_NOT_FOUND: 'User not found',
    INVALID_CREDENTIALS: 'Invalid credentials',
    EMAIL_ALREADY_VERIFIED: 'Email already verified',
    TOKEN_EXPIRED: 'Token has expired',
    DATABASE_ERROR: 'Database operation failed'
  },
  
  // Success Messages
  SUCCESS: {
    LOGIN_SUCCESS: 'Login successful',
    SIGNUP_SUCCESS: 'Signup completed successfully',
    EMAIL_SENT: 'Email sent successfully',
    PROFILE_UPDATED: 'Profile updated successfully',
    DOCUMENT_UPLOADED: 'Document uploaded successfully',
    VERIFICATION_SUCCESS: 'Verification successful'
  }
};