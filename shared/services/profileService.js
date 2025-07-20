  // services/profileService.js
  const CompanyProfile = require('../../models/sintracapFounder');
  const InvestorProfile = require('../../models/sintracapInvestor');
  const mongoose = require('mongoose');
  // Helper functions
  function shouldUpdate(value) {
    if (value === undefined || value === null) return false;
    if (typeof value === 'string' && value.trim() === '') return false;
    if (Array.isArray(value) && value.length === 0) return false;
    return true;
  }

  function formatDate(dateString) {
    if (!dateString || typeof dateString !== 'string') return null;
    
    const trimmed = dateString.trim();
    return /^\d{4}$/.test(trimmed) ? new Date(`${trimmed}-01-01`) : new Date(dateString);
  }

  function processArrayField(newArray, existingArray = []) {
    if (typeof newArray === 'string') {
      newArray = newArray.split(',').map(item => item.trim()).filter(item => item.length > 0);
    }
    
    return (!newArray || newArray.length === 0) && existingArray?.length > 0 
      ? existingArray 
      : (newArray || []);
  }

  function getCleanedData(profileData) {
    const cleanedData = { ...profileData };
    // Remove authentication fields
    delete cleanedData.password;
    delete cleanedData.emailVerificationToken;
    delete cleanedData.emailVerificationExpires;
    
    // Create update operations for non-empty fields only
    const updateOperations = {};
    Object.keys(cleanedData).forEach(key => {
      if (shouldUpdate(cleanedData[key])) {
        updateOperations[key] = cleanedData[key];
      }
    });
    
    return updateOperations;
  }

  // Process founder-specific data
  function processFounderData(updateOperations, existingUser, documentUrls) {
    // Format dates
    if (updateOperations.foundedDate) {
      updateOperations.foundedDate = formatDate(updateOperations.foundedDate);
    }
    
    // Process funding raised
    if (updateOperations.fundingRaised) {
      const fundingRaised = updateOperations.fundingRaised;
      const existingFunding = existingUser.fundingRaised || {};
      
      // Create merged funding
      const mergedFunding = { ...existingFunding, ...fundingRaised };
      
      // Only update amount if it's not null
      if (fundingRaised.amount === null && existingFunding.amount !== null) {
        mergedFunding.amount = existingFunding.amount;
      }
      
      // Process funding rounds
      if (fundingRaised.rounds?.length > 0) {
        mergedFunding.rounds = fundingRaised.rounds.map(round => {
          if (round.date) round.date = formatDate(round.date);
          return round;
        });
      } else if (existingFunding.rounds) {
        mergedFunding.rounds = existingFunding.rounds;
      }
      updateOperations.signupStatus = 'role-selected';
      updateOperations.documents = documentUrls;
      updateOperations.fundingRaised = mergedFunding;
    }
    
    // Process financials
    if (updateOperations.financials) {
      const hasValidData = updateOperations.financials.some(item => 
        item.year !== null || item.revenue !== null || item.profit !== null || 
        item.burnRate !== null || item.valuation !== null
      );
      
      if (!hasValidData && existingUser.financials?.length > 0) {
        updateOperations.financials = existingUser.financials;
      }
    } else if (existingUser.financials?.length > 0) {
      updateOperations.financials = existingUser.financials;
    }
    
    return updateOperations;
  }

  // Process investor-specific data
  function processInvestorData(updateOperations, existingUser, documentUrls) {
    // Handle investment interests
    updateOperations.investmentInterests = processArrayField(
      updateOperations.investmentInterests, 
      existingUser.investmentInterests
    );
    updateOperations.signupStatus = 'role-selected';
    updateOperations.documents = documentUrls;
        
    // Process previousInvestments
    if (updateOperations.previousInvestments) {
      const isInvalidFormat = typeof updateOperations.previousInvestments === 'string' || 
        (Array.isArray(updateOperations.previousInvestments) && 
        updateOperations.previousInvestments.length > 0 && 
        typeof updateOperations.previousInvestments[0] !== 'object');
      if (isInvalidFormat) {
        updateOperations.previousInvestments = existingUser.previousInvestments || [];
      } else if (Array.isArray(updateOperations.previousInvestments)) {
        const validInvestments = updateOperations.previousInvestments
          .filter(inv => inv && typeof inv === 'object')
          .map(inv => ({
            companyName: inv.companyName || '',
            industry: inv.industry || '',
            stage: inv.stage || '',
            amountInvested: typeof inv.amountInvested === 'number' ? inv.amountInvested : null,
            year: typeof inv.year === 'number' ? inv.year : null,
            status: ['Active', 'Exited', 'IPO', 'Acquired'].includes(inv.status) ? inv.status : 'Active',
            website: inv.website || '',
            logoURL: inv.logoURL || ''
          }));
        updateOperations.previousInvestments = validInvestments.length > 0 
          ? validInvestments 
          : (existingUser.previousInvestments || []);
      }
    }
    
    // Handle notableExits
    updateOperations.notableExits = processArrayField(
      updateOperations.notableExits, 
      existingUser.notableExits
    );
    return updateOperations;
  }

  async function updateUserProfile(profileData, role, documentUrls) {
    try {
      const email = profileData.email;
      if (!email) throw new Error("Email is required to find and update user profile");
      
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
      // Get cleaned data for update
      const updateOperations = getCleanedData(profileData);
      
      let updateResult;
      let existingUser;
      
      if (role === 'founder') {
        // Get existing founder user
        existingUser = await CompanyProfile.findOne({ email, role: 'founder' });
        if (!existingUser) throw new Error(`User with email ${email} and role founder not found`);
        
        // Process founder-specific data
        const processedData = processFounderData(updateOperations, existingUser, formattedDocs);
        
        // Update profile
        updateResult = await CompanyProfile.findOneAndUpdate(
          { email, role: 'founder' },
          { $set: processedData },
          { new: true }
        );
      } else if (role === 'investor') {
        // Get existing investor user
        existingUser = await InvestorProfile.findOne({ email, role: 'investor' });
        if (!existingUser) throw new Error(`User with email ${email} and role investor not found`);
        
        // Process investor-specific data
        const processedData = processInvestorData(updateOperations, existingUser, formattedDocs);
        // Update profile
        updateResult = await InvestorProfile.findOneAndUpdate(
          { email, role: 'investor' },
          { $set: processedData },
          { new: true }
        );
      } else {
        throw new Error(`Invalid role: ${role}`);
      }
      
      if (!updateResult) throw new Error(`Failed to update user profile for ${email}`);
      
      return {
        success: true,
        message: `Profile updated successfully for ${role} with email ${email}`,
        updatedId: updateResult._id,
        fieldsUpdated: Object.keys(updateOperations)
      };
    } catch (error) {
      console.error(`Error updating user profile: ${error.message}`);
      throw new Error(`Failed to update user profile: ${error.message}`);
    }
  }

  async function deleteDocument(email, role, documentId, type) {
      try {
          if (!email || !documentId || !type) {
              throw new Error("Email, document ID, and type are required");
          }
          
          if (!['document', 'pitchDeck'].includes(type)) {
              throw new Error('Document type must be "document" or "pitchDeck"');
          }
          
          if (!['investor', 'founder'].includes(role)) {
              throw new Error('Invalid role');
          }
          
          // Determine array field based on type
          const arrayField = type === 'pitchDeck' ? 'pitchDeckDocuments' : 'documents';
          
          let result;
          let user;
          
          if (role === 'founder') {
              // First find the user to check if document exists
              user = await CompanyProfile.findOne({ email, role: 'founder' });
              if (!user) {
                  throw new Error(`User with email ${email} and role ${role} not found`);
              }
              
              // Check if document exists in the array
              const documents = user[arrayField] || [];
              const documentExists = documents.some(doc => 
                  doc.documentId === documentId || doc._id.toString() === documentId
              );
              
              if (!documentExists) {
                  throw new Error(`Document with ID ${documentId} not found`);
              }
              
              // Remove the document
              result = await CompanyProfile.findOneAndUpdate(
                  { email, role: 'founder' },
                  {
                      $pull: {
                          [arrayField]: {
                              $or: [
                                  { documentId: documentId }
                              ]
                          }
                      }
                  },
                  { new: true }
              );
          } else if (role === 'investor') {
              // First find the user to check if document exists
              user = await InvestorProfile.findOne({ email, role: 'investor' });
              if (!user) {
                  throw new Error(`User with email ${email} and role ${role} not found`);
              }
              
              // Check if document exists in the array
              const documents = user[arrayField] || [];
              const documentExists = documents.some(doc => 
                  doc.documentId === documentId || doc._id.toString() === documentId
              );
              
              if (!documentExists) {
                  throw new Error(`Document with ID ${documentId} not found`);
              }
              
              // Remove the document
              result = await InvestorProfile.findOneAndUpdate(
                  { email, role: 'investor' },
                  {
                      $pull: {
                          [arrayField]: {
                              $or: [
                                  { documentId: documentId },
                                  { _id: documentId }
                              ]
                          }
                      }
                  },
                  { new: true }
              );
          }
          
          if (!result) {
              throw new Error(`Failed to delete document`);
          }
          
          return {
              success: true,
              message: `${type === 'pitchDeck' ? 'Pitch deck' : 'Document'} deleted successfully`,
              data: { documentId, type }
          };
          
      } catch (error) {
          console.error(`Error deleting document: ${error.message}`);
          throw new Error(`Failed to delete document: ${error.message}`);
      }
  }

  module.exports = { updateUserProfile, deleteDocument };