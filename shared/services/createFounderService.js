// shared/services/CompanyProfileService.js
const mongoose = require('mongoose');
const CompanyProfile = require('../../models/sintracapFounder');
const { ValidationError, DatabaseError } = require('../middleware/errorHandler');

class CompanyProfileService {
  /**
   * Create a brand-new founder profile (no pre-signup required).
   *
   * @param {object} profileData
   * @returns {Promise<{ status: string, companyId: string }>}
   */
  static async createFounderProfile(email, profileData) {
    const {
      companyName,
      logoURL,
      password,
      description,
      industry,
      sector,
      foundedDate,
      fundingStage,
      teamSize,
      website,
      phone,
      address,
      agreedToTerms,
      documentUrls
    } = profileData;

    // Validate required fields
    if (!email || typeof email !== 'string') {
      throw new ValidationError('Valid email is required');
    }
    if (!companyName) {
      throw new ValidationError('Company name is required');
    }
    if (!agreedToTerms) {
      throw new ValidationError('You must agree to terms and conditions');
    }

    // Check for existing profile
    const exists = await CompanyProfile.findOne({ email });
    if (exists) {
      throw new ValidationError('A profile with this email already exists');
    }

    // Format uploaded docs
    const formattedDocs = Array.isArray(documentUrls)
      ? documentUrls.map(doc => ({
          documentId: new mongoose.Types.ObjectId().toString(),
          name: doc.originalName || 'Document',
          url: doc.url,
          uploadedAt: new Date(),
          isVerified: false
        }))
      : [];

    // Build and save new profile
    const company = new CompanyProfile({
      email,
      companyName,
      logoURL,
      password,      // hash upstream
      description,
      industry,
      sector,
      foundedDate,
      fundingStage,
      teamSize,
      website,
      phone,
      address,
      agreedToTerms: true,
      documents: formattedDocs,
      signupStatus: 'complete',
      emailVerified: true,
    });

    try {
      await company.save();
      return { status: 'success', companyId: company._id.toString() };
    } catch (err) {
      throw new DatabaseError('Failed to create new founder profile');
    }
  }
}

module.exports = CompanyProfileService;
