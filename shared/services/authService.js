// shared/services/authService.js
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const constants = require('../config/constants');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const { ValidationError, DatabaseError, AuthError } = require('../middleware/errorHandler');
const OnboardingService = require('./onboardingService'); 
// Import the models
const InvestorProfile = require('../../models/sintracapInvestor');
const CompanyProfile = require('../../models/sintracapFounder');
const { EmailApiService } = require('./EmailApiService');

/**
 * Helper function to hash password
 */
const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

/**
 * Helper function to compare passwords
 */
const comparePassword = async (password, hashedPassword) => {
  return bcrypt.compare(password, hashedPassword);
};

/**
 * Helper to find user by email across both models
 */
const findUserByEmail = async (email) => {
  try {
    // Check investor profile first
    let user = await InvestorProfile.findOne({ email });
    if (user) {
      return { user, role: 'investor' };
    }

    // Check company profile
    user = await CompanyProfile.findOne({ email });
    if (user) {
      return { user, role: 'founder' };
    }

    return { user: null, role: null };
  } catch (error) {
    throw new DatabaseError('Failed to query user data');
  }
};

class AuthService {
  /**
   * Generate verification token
   */
  static generateVerificationToken() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  /**
   * Send email verification
   */
  static async emailVerification(email) {
    if (!email) {
      throw new ValidationError('Email is required');
    }

    const { user, role } = await findUserByEmail(email);
    if (!user) {
      throw new ValidationError('User not found');
    }

    // Generate verification token
    const verificationToken = AuthService.generateVerificationToken();

    // Update user with verification token
    user.emailVerificationToken = verificationToken;
    user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

    try {
      await user.save();
      console.log("...", email, verificationToken);
      await AuthService.sendVerificationEmail(email, verificationToken);
    } catch (error) {
      throw new DatabaseError('Failed to send verification email');
    }
  }

  /**
   * Send verification email
   */
  static async sendVerificationEmail(email, token) {
    if (!email || !token) {
      throw new ValidationError('Email and token are required');
    }

    try {
      // Prepare email data for EmailApiService
      const emailData = {
        to: email,
        subject: "Verify Your Email Address",
        htmlTemplate: EmailApiService.createVerificationEmailTemplate(token),
        textTemplate: EmailApiService.createVerificationEmailTextTemplate(token),
        from: "Sintracap <noreply@actofit.com>", // You can update this to your preferred sender
      };

      // Send email using EmailApiService
      const response = await EmailApiService.sendEmail(emailData);

      console.log('Verification email sent successfully:', response);
      return response;

    } catch (error) {
      console.error('Failed to send verification email:', error.message);
      throw new DatabaseError('Failed to send verification email');
    }
  }

  /**
   * Generate JWT tokens for user authentication
   */
  static async generateTokens(user, role) {
    try {
      const jwtAccessToken = jwt.sign(
        { userId: user._id, email: user.email, role },
        constants.JWT_SECRET,
        { expiresIn: constants.JWT_EXPIRE }
      );
      return { jwtAccessToken };
    } catch (error) {
      throw new AuthError('Failed to generate authentication token');
    }
  }

  /**
   * Check if email is available (not already registered)
   */
  static async isEmailAvailable(email) {
    const { user } = await findUserByEmail(email);
    return !user;
  }

  /**
   * Check if user is LinkedIn user
   */
  static async isLinkedInUser(email) {
    const { user } = await findUserByEmail(email);
    return user && user.provider === 'linkedin';
  }

  static async isGoogleUser(email) {
    const { user } = await findUserByEmail(email);
    return user && user.provider === 'google';
  }

  /**
   * Get users by role
   */
  static async getUsersByRole(role, options = {}) {
    if (!['investor', 'founder'].includes(role)) {
      throw new ValidationError('Invalid role specified. Valid roles are "investor" and "founder".');
    }

    try {
      const {
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = -1
      } = options;

      // Calculate skip value for pagination
      const skip = (page - 1) * limit;

      // Create sort object
      const sort = { [sortBy]: sortOrder };

      let users = [];
      let totalCount = 0;

      if (role === 'investor') {
        // Get total count for pagination
        totalCount = await InvestorProfile.countDocuments();

        // Get paginated users
        users = await InvestorProfile.find()
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .lean();
        console.log("role ,", role, " users ", users);
      } else if (role === 'founder') {
        // Get total count for pagination
        totalCount = await CompanyProfile.countDocuments();

        // Get paginated users
        users = await CompanyProfile.find()
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .lean();
      }

      return {
        users,
        totalCount
      };
    } catch (error) {
      throw new DatabaseError('Failed to fetch users');
    }
  }

  /**
   * Get user role by ID
   */
  static async getUserRole(userId) {
    try {
      // Check in investor collection
      const investor = await InvestorProfile.findById(userId);
      if (investor) {
        return 'investor';
      }

      // Check in company collection
      const founder = await CompanyProfile.findById(userId);
      if (founder) {
        return 'founder';
      }

      throw new ValidationError('User not found');
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new DatabaseError('Failed to determine user role');
    }
  }

  /**
   * Check if pre-signup entry exists
   */
  static async preSignupExists(email) {
    try {
      const investorPreSignup = await InvestorProfile.findOne({
        email,
        signupStatus: 'pre-signup'
      });

      const founderPreSignup = await CompanyProfile.findOne({
        email,
        signupStatus: 'pre-signup'
      });

      return !!(investorPreSignup || founderPreSignup);
    } catch (error) {
      throw new DatabaseError('Failed to check pre-signup status');
    }
  }

  /**
   * Create pre-signup user entry
   */
  static async createPreSignupUser(userData) {
    const { email, password, name, phone, agreedToTerms, role, isLinkedInUser, authMethod, category, subcategory } = userData;

    if (!email || !role) {
      throw new ValidationError('Email and role are required');
    }

    if (authMethod == "google") {
      await AuthService.handleGooglePreSignupUser(email, name, phone, agreedToTerms, role);
      return;
    }

    if (isLinkedInUser) {
      await AuthService.handleLinkedInPreSignupUser(email, name, phone, agreedToTerms, role);
      return;
    }

    if (!password) {
      throw new ValidationError('Password is required');
    }

    try {
      const hashedPassword = await hashPassword(password);

      if (role === 'investor') {
        const preSignupInvestor = new InvestorProfile({
          email,
          password: hashedPassword,
          fullName: name,
          phone,
          agreedToTerms,
          signupStatus: 'pre-signup',
        });
        await preSignupInvestor.save();
      } else if (role === 'founder') {
        console.log(",,,", category, subcategory); 
        const preSignupFounder = new CompanyProfile({
          email,
          password: hashedPassword,
          companyName: name || 'Company Name',
          phone,
          agreedToTerms,
          category,
          subcategory,
          signupStatus: 'pre-signup',
        });
        await preSignupFounder.save();
      } else {
        throw new ValidationError('Invalid role specified');
      }
    } catch (error) {
      console.log("Error creating pre-signup user:", error);
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new DatabaseError('Failed to create pre-signup user');
    }
  }

  /**
   * Handle LinkedIn pre-signup user
   */
  static async handleLinkedInPreSignupUser(email, name, phone, agreedToTerms, role) {
    try {
      if (role === 'investor') {
        const preSignupInvestor = await InvestorProfile.findOne({ email });
        if (!preSignupInvestor) {
          throw new ValidationError('Investor pre-signup not found');
        }
        preSignupInvestor.emailVerified = true;
        preSignupInvestor.fullName = name;
        preSignupInvestor.phone = phone;
        preSignupInvestor.agreedToTerms = agreedToTerms;
        await preSignupInvestor.save();
      } else if (role === 'founder') {
        const preSignupFounder = await CompanyProfile.findOne({ email });
        if (!preSignupFounder) {
          throw new ValidationError('Founder pre-signup not found');
        }
        preSignupFounder.emailVerified = true;
        preSignupFounder.companyName = name;
        preSignupFounder.phone = phone;
        preSignupFounder.agreedToTerms = agreedToTerms;
        await preSignupFounder.save();
      } else {
        throw new ValidationError('Invalid role specified');
      }
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new DatabaseError('Failed to update LinkedIn pre-signup user');
    }
  }

  static async handleGooglePreSignupUser(email, name, phone, agreedToTerms, role) {
    try {
      if (role === 'investor') {
        const preSignupInvestor = await InvestorProfile.findOne({ email });
        if (!preSignupInvestor) {
          throw new ValidationError('Investor pre-signup not found');
        }
        preSignupInvestor.emailVerified = true;
        preSignupInvestor.fullName = name;
        preSignupInvestor.phone = phone;
        preSignupInvestor.agreedToTerms = agreedToTerms;
        await preSignupInvestor.save();
      } else if (role === 'founder') {
        const preSignupFounder = await CompanyProfile.findOne({ email });
        if (!preSignupFounder) {
          throw new ValidationError('Founder pre-signup not found');
        }
        preSignupFounder.emailVerified = true;
        preSignupFounder.companyName = name;
        preSignupFounder.phone = phone;
        preSignupFounder.agreedToTerms = agreedToTerms;
        await preSignupFounder.save();
      } else {
        throw new ValidationError('Invalid role specified');
      }
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new DatabaseError('Failed to update LinkedIn pre-signup user');
    }
  }

  /**
   * Create investor profile
   */
  static async createInvestorProfile(email, profileData) {
    const { interests, investmentPreferences, amountRange, documentUrls } = profileData;

    try {
      const investor = await InvestorProfile.findOne({
        email,
        signupStatus: 'pre-signup'
      });

      if (!investor) {
        throw new ValidationError('Pre-signup investor not found');
      }

      // Format documents if they exist
      let formattedDocs = [];
      if (documentUrls && (Array.isArray(documentUrls) || typeof documentUrls === 'object')) {
        const docsArray = Array.isArray(documentUrls) ? documentUrls : [documentUrls];

        formattedDocs = docsArray.map(doc => ({
          documentId: new mongoose.Types.ObjectId().toString(),
          name: doc.originalName || doc.name || 'Document',
          url: doc.url || '',
          type: doc.contentType || doc.type || 'application/octet-stream',
          uploadedAt: new Date(),
          isVerified: false
        }));
      }

      // Update investor profile
      investor.investmentInterests = interests || [];
      investor.amountRange = amountRange || '';
      investor.documents = formattedDocs;
      investor.signupStatus = 'role-selected';

      await investor.save();
      return { status: 'success' };
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new DatabaseError('Failed to create investor profile');
    }
  }

  /**
   * Create founder profile
   */
  static async createFounderProfile(email, profileData) {
    const { startupDescription, industry, fundingStage, teamSize, documentUrls } = profileData;

    try {
      const company = await CompanyProfile.findOne({ email, signupStatus: 'pre-signup' });
      if (!company) {
        throw new ValidationError('Pre-signup company not found');
      }

      let formattedDocs = [];
      if (documentUrls && (Array.isArray(documentUrls) || typeof documentUrls === 'object')) {
        const docsArray = Array.isArray(documentUrls) ? documentUrls : [documentUrls];

        formattedDocs = docsArray.map(doc => ({
          documentId: new mongoose.Types.ObjectId().toString(),
          name: doc.originalName || doc.name || 'Document',
          url: doc.url || '',
          type: doc.contentType || doc.type || 'application/octet-stream',
          uploadedAt: new Date(),
          isVerified: false
        }));
      }

      // Update company profile
      company.description = startupDescription || company.description;
      company.industry = industry || company.industry;
      company.fundingStage = fundingStage || company.stage;
      company.teamSize = teamSize || company.teamSize;
      company.documents = formattedDocs;
      company.signupStatus = 'role-selected';

      await company.save();
      return { status: 'success' };
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new DatabaseError('Failed to create founder profile');
    }
  }

  /**
   * Finalize signup
   */
  static async finalizeSignup(email) {
    const { user, role } = await findUserByEmail(email);

    if (!user || user.signupStatus !== 'role-selected') {
      throw new ValidationError('User not found or signup not yet completed');
    }

    try {
      // Update user status
      user.signupStatus = 'complete';
      //Need to update dynamically based on founder's category and subcategory
      user.category = 'public-equities';
      user.subcategory = 'Pre-IPO/IPO';
      await user.save();
      console.log("Finalizing signup for user:", user._id, "with role:", role);

      await OnboardingService.initializeFounderProgress(user._id, user.category, user.subcategory);
      // Generate JWT token
      const { jwtAccessToken } = await AuthService.generateTokens(user, role);

      return {
        status: 'success',
        userId: user._id,
        username: role === 'investor' ? user.fullName : user.companyName,
        role: role,
        jwtAccessToken: jwtAccessToken
      };
    } catch (error) {
      console.error('Error finalizing signup:', error);
      throw new DatabaseError('Failed to finalize signup');
    }
  }

  /**
   * User login
   */
  static async login(email, password) {
    if (!email || !password) {
      throw new ValidationError('Email and password are required');
    }

    // Find user by email
    const { user, role } = await findUserByEmail(email);
    if (!user || user.signupStatus !== 'complete') {
      throw new AuthError('Invalid email or password');
    }

    try {
      // Verify password
      const isPasswordValid = await comparePassword(password, user.password);
      if (!isPasswordValid) {
        throw new AuthError('Invalid email or password');
      }

      // Generate token
      const { jwtAccessToken } = await AuthService.generateTokens(user, role);

      return {
        userId: user._id,
        jwtAccessToken: jwtAccessToken,
        role: role,
        name: role === 'investor' ? user.fullName : user.companyName,
        email: user.email,
        success: true,
        isVerified: user.isVerifiedByAdmin,
      };
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new DatabaseError('Login failed');
    }
  }

  /**
   * Toggle user verification status
   */
  static async toggleVerificationStatus(userId, role, verificationStatus) {
    if (!userId || !role || typeof verificationStatus !== 'boolean') {
      throw new ValidationError('User ID, role, and verification status are required');
    }

    try {
      let user;
      if (role === 'investor') {
        user = await InvestorProfile.findById(userId);
      } else if (role === 'founder') {
        user = await CompanyProfile.findById(userId);
      }

      if (!user) {
        throw new ValidationError('User not found');
      }

      user.isVerifiedByAdmin = verificationStatus;
      user.verifiedAt = verificationStatus ? new Date() : null;
      await user.save();

      return {
        userId,
        role,
        isVerified: user.isVerifiedByAdmin,
        verifiedAt: user.verifiedAt
      };
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new DatabaseError('Failed to toggle verification status');
    }
  }

  /**
   * Get dashboard data
   */
  static async getDashboardData(userId, role) {
    if (!userId || !role) {
      throw new ValidationError('User ID and role are required');
    }

    try {
      let user;
      if (role === 'investor') {
        user = await InvestorProfile.findById(userId);
      } else if (role === 'founder') {
        user = await CompanyProfile.findById(userId);
      } else if (role === 'admin') {
        return {
          user: { _id: userId, role: 'admin' },
          stats: {
            investorCount: await InvestorProfile.countDocuments({ signupStatus: 'complete' }),
            founderCount: await CompanyProfile.countDocuments({ signupStatus: 'complete' }),
            pendingVerifications: await InvestorProfile.countDocuments({ isVerifiedByAdmin: false, signupStatus: 'complete' }) +
              await CompanyProfile.countDocuments({ isVerifiedByAdmin: false, signupStatus: 'complete' })
          }
        };
      }

      if (!user) {
        throw new ValidationError('User not found');
      }

      // Return dashboard data based on role
      if (role === 'investor') {
        return {
          _id: user._id,
          name: user.fullName,
          email: user.email,
          role: 'investor',
          verified: user.isVerifiedByAdmin,
          interests: user.investmentInterests,
          photoURL: user.photoURL,
          investmentInterests: user.investmentInterests,
          amountRange: user.amountRange,
          requestedDocuments: user.requestedDocuments,
          documents: user.documents,
          stats: {
            founderCount: await CompanyProfile.countDocuments({ signupStatus: 'complete' }),
          }
        };
      } else if (role === 'founder') {
        return {
          _id: user._id,
          name: user.companyName,
          email: user.email,
          role: 'founder',
          verified: user.isVerifiedByAdmin,
          companyName: user.companyName,
          description: user.description,
          logoURL: user.logoURL,
          industry: user.industry,
          fundingStage: user.fundingStage,
          teamSize: user.teamSize,
          requestedDocuments: user.requestedDocuments,
          documents: user.documents,
          stats: {
            investorCount: await InvestorProfile.countDocuments({ signupStatus: 'complete' }),
          }
        };
      }
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new DatabaseError('Failed to fetch dashboard data');
    }
  }

  /**
   * Handle Google OAuth callback
   */
  static async handleGoogleCallback(googleUserData) {
    const { uid, email, displayName, photoURL, role } = googleUserData;

    if (!email) {
      throw new ValidationError('Email is required from Google data');
    }

    try {
      const { user: existingUser, role: existingRole } = await findUserByEmail(email);
      let wasReactivated = false;
      let isNewUser = false;
      let roleToUse = role || existingRole;
      let user = null;
      if (!existingUser) {
        if (roleToUse === 'investor') {
          const newInvestor = new InvestorProfile({
            email: email,
            emailVerified: true,
            photoURL: photoURL,
            password: await hashPassword(Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12)),
            fullName: displayName || '',
            phone: '',
            provider: 'google',
            providerId: uid,
            agreedToTerms: true,
            signupStatus: 'pre-signup',
            isActive: true
          });
          await newInvestor.save();
          user = newInvestor;
        } else if (roleToUse === 'founder') {
          const newCompany = new CompanyProfile({
            email: email,
            logoURL: photoURL,
            emailVerified: true,
            password: await hashPassword(Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12)),
            companyName: displayName || 'Company Name',
            phone: '',
            providerId: uid,
            agreedToTerms: true,
            signupStatus: 'pre-signup',
            provider: 'google',
            isActive: true
          });
          await newCompany.save();
          user = newCompany;
        }
        isNewUser = true;
      } else {
        // Update existing user
        if (existingUser.isActive === false) {
          existingUser.isActive = true;
          wasReactivated = true;
        }

        if (!existingUser.providerId) {
          existingUser.providerId = uid;
        }

        if (existingRole === 'investor' && (!existingUser.fullName || existingUser.fullName.trim() === '')) {
          existingUser.fullName = displayName || '';
        } else if (existingRole === 'founder' && (!existingUser.companyName || existingUser.companyName.trim() === '')) {
          existingUser.companyName = displayName || 'Company Name';
        }

        await existingUser.save();
        user = existingUser;
        roleToUse = existingRole;
      }

      const { jwtAccessToken } = await AuthService.generateTokens(user, roleToUse);

      return {
        user: {
          userId: user._id,
          email: user.email,
          emailVerified: true,
          isVerifiedByAdmin: user.isVerifiedByAdmin,
          name: roleToUse === 'investor' ? user.fullName : user.companyName,
          signupStatus: user.signupStatus,
          wasReactivated: wasReactivated,
          role: roleToUse
        },
        jwtAccessToken: jwtAccessToken,
        isNewUser: isNewUser,
      };
    } catch (error) {
      console.log("error", error);
      throw new DatabaseError('Google authentication failed');
    }
  }

  /**
   * Admin login
   */
  static async adminLogin(email, password) {
    if (!email || !password) {
      throw new ValidationError('Email and password are required');
    }

    try {
      const adminEmails = constants.ADMIN_EMAILS || [];
      if (!adminEmails.includes(email)) {
        throw new AuthError('Invalid admin credentials');
      }

      if (password !== constants.ADMIN_PASSWORD) {
        throw new AuthError('Invalid admin credentials');
      }

      const adminUser = {
        _id: new mongoose.Types.ObjectId().toString(),
        email: email,
        name: 'Administrator',
        role: 'admin'
      };

      const jwtAccessToken = jwt.sign(
        { userId: adminUser._id, email: adminUser.email, role: 'admin' },
        constants.JWT_SECRET,
        { expiresIn: constants.JWT_EXPIRE }
      );

      return {
        user: {
          _id: adminUser._id,
          email: adminUser.email,
          name: adminUser.name || 'Sintracap Admin',
          isAdmin: true,
          profile: {
            firstName: 'Admin',
            lastName: '',
            photoURL: ''
          }
        },
        token: jwtAccessToken
      };
    } catch (error) {
      if (error instanceof ValidationError || error instanceof AuthError) {
        throw error;
      }
      throw new DatabaseError('Admin login failed');
    }
  }

  /**
   * Complete LinkedIn authentication
   */
  static async completeLinkedInAuth(code, redirectUri, role) {
    if (!code || !redirectUri) {
      throw new ValidationError('Code and redirect URI are required');
    }

    try {
      const clientId = process.env.LINKEDIN_CLIENT_ID || '86yfv12jlk4udi';
      const clientSecret = process.env.LINKEDIN_CLIENT_SECRET || 'WPL_AP1.NoBYiQ67C1jTiIR0.N+xZ1Q==';

      // Exchange code for access token
      const tokenResponse = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', null, {
        params: {
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: redirectUri,
          client_id: clientId,
          client_secret: clientSecret
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const { access_token } = tokenResponse.data;

      // Get user profile
      const profileResponse = await axios.get('https://api.linkedin.com/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${access_token}`
        },
        timeout: 10000
      });

      const profileData = profileResponse.data;
      const email = profileData.email;

      if (!email) {
        throw new ValidationError('Could not retrieve email from LinkedIn. Please ensure you have granted email permission.');
      }

      

      const UserModel = role === 'founder' ? CompanyProfile : InvestorProfile;
      let user = await UserModel.findOne({ email });
      let isNewUser = false;

      if (user) {
        // Update existing user
        user.emailVerified = true;
        if (role === 'founder' && !user.companyName && profileData.given_name) {
          user.companyName = `${profileData.given_name} ${profileData.family_name}`.trim();
        } else if (role === 'investor' && !user.fullName && profileData.given_name) {
          user.fullName = `${profileData.given_name} ${profileData.family_name}`.trim();
          if (!user.linkedIn && profileData.sub) {
            user.linkedIn = `https://www.linkedin.com/in/${profileData.sub}`;
          }
        }
        await user.save();
      } else {
        // Create new user
        if (role === 'founder') {
          user = new CompanyProfile({
            companyName: `${profileData.given_name} ${profileData.family_name}`.trim(),
            email: email,
            role: 'founder',
            emailVerified: true,
            signupStatus: 'pre-signup',
            provider: 'linkedin',
            linkedIn: profileData.sub ? `https://www.linkedin.com/in/${profileData.sub}` : '',
          });
        } else {
          user = new InvestorProfile({
            fullName: `${profileData.given_name} ${profileData.family_name}`.trim(),
            email: email,
            linkedIn: profileData.sub ? `https://www.linkedin.com/in/${profileData.sub}` : '',
            role: 'investor',
            provider: 'linkedin',
            emailVerified: true,
            signupStatus: 'pre-signup',
          });
        }
        isNewUser = true;
        await user.save();
      }

      let { jwtAccessToken } = await AuthService.generateTokens(user, user.role);
      if (isNewUser) {
        jwtAccessToken = null;
      }

      return {
        user: {
          userId: user._id,
          email: user.email,
          emailVerified: true,
          isVerifiedByAdmin: user.isVerifiedByAdmin,
          name: user.role === 'investor' ? user.fullName : user.companyName,
          signupStatus: user.signupStatus,
          role: user.role,
          linkedIn: user.linkedIn,
        },
        token: jwtAccessToken,
        isNewUser: isNewUser
      };
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new DatabaseError('LinkedIn authentication failed');
    }
  }

  /**
   * Create verification email template
   */
  static async createVerificationEmailTemplate(token) {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Email Verification</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
          
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
            color: #1f2937;
            background-color: #f9fafb;
          }
          
          .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 40px 20px;
          }
          
          .email-wrapper {
            background-color: #ffffff;
            border-radius: 12px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
            overflow: hidden;
          }
          
          .email-header {
            background-color: #1e40af;
            padding: 30px;
            text-align: center;
          }
          
          .logo {
            width: 160px;
            height: auto;
          }
          
          .email-body {
            padding: 40px 30px;
          }
          
          h1 {
            font-size: 22px;
            font-weight: 600;
            color: #111827;
            margin-bottom: 16px;
          }
          
          p {
            margin-bottom: 24px;
            font-size: 16px;
            color: #4b5563;
          }
          
          .token-container {
            background-color: #f3f4f6;
            border-radius: 6px;
            padding: 16px;
            margin-bottom: 24px;
            text-align: center;
          }
          
          .verification-token {
            font-family: monospace;
            font-size: 18px;
            letter-spacing: 2px;
            font-weight: 600;
            color: #111827;
          }
          
          .email-footer {
            background-color: #f9fafb;
            padding: 24px;
            text-align: center;
            font-size: 14px;
            color: #6b7280;
            border-top: 1px solid #e5e7eb;
          }
          
          .help-text {
            font-size: 13px;
            margin-top: 16px;
          }
          
          .help-text a {
            color: #2563eb;
            text-decoration: none;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="email-wrapper">
            <div class="email-header">
              <img src="https://sintracap.blob.core.windows.net/sintracap-logo/Sintracap.jpg" alt="Sintracap" class="logo">
            </div>
            
            <div class="email-body">
              <h1>Verify your email address</h1>
              
              <p>Hi there,</p>
              
              <p>Thanks for signing up for Sintracap! To complete your registration, please use the verification token below:</p>
              
              <div class="token-container">
                <span class="verification-token">${token}</span>
              </div>
              
              <p>This verification token will expire in 24 hours. If you didn't create an account with Sintracap, you can safely ignore this email.</p>
              
              <p>Best regards,<br>The Sintracap Team</p>
            </div>
            
            <div class="email-footer">
              <p>© ${new Date().getFullYear()} Sintracap. All rights reserved.</p>
              <p class="help-text">
                Need help? Contact our support team at <a href="mailto:support@sintracap.com">support@sintracap.com</a>
              </p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}

module.exports = AuthService; 