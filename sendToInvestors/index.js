const {
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const dbConfig = require('../shared/config/db.config');
const FundingRequest = require('../models/fundingRequest');
const CompanyProfile = require('../models/sintracapFounder');
const authenticateToken = require('../shared/middleware/authenticateToken');
const SendPitchDeckHelper = require('../shared/hellpers/SendPitchDeckHelper');
const PitchDeckService = require('../shared/services/PitchDeckService');
const InvestorService = require('../shared/services/InvestorService');
const FounderInvestorMatch = require('../models/founderInvestorMatch');

// Main function handler
async function sendToInvestorsHandler(context, req) {
    await ensureDbConnection(dbConfig, context);

    const authenticatedUser = await authenticateToken(context, req);
    if (!authenticatedUser) {
        return;
    }

    const {
        fundingRequestId,
        investorIds = [],
        customEmailMessage = '',
        specifiedPitchDeckDocumentIds = []
    } = req.body;

    // Basic validation
    if (!fundingRequestId) {
        throw new ValidationError('Funding request ID is required');
    }

    if (!investorIds.length) {
        throw new ValidationError('At least one investor ID is required');
    }

    // Get funding request and check permissions
    const fundingRequest = await FundingRequest.findById(fundingRequestId).populate('founderId');
    if (!fundingRequest) {
        throw new ValidationError('Funding request not found');
    }

    const isOwner = fundingRequest.founderId._id.toString() === authenticatedUser._id.toString();
    const isAdmin = authenticatedUser.role === 'admin';

    if (!isOwner && !isAdmin) {
        throw new ValidationError('You do not have permission to send emails for this funding request');
    }

    // Get founder profile
    const founderProfile = await CompanyProfile.findById(fundingRequest.founderId._id);
    if (!founderProfile) {
        throw new ValidationError('Founder profile not found');
    }

    let allInvestorEmails = [];
    let contactedInvestorIds = [];
    let emailMethod = 'direct_emails';
    
    const savedInvestorIds = await FounderInvestorMatch.find({
        fundingRequestId: fundingRequest._id
    }).distinct('investorId');

    // Convert savedInvestorIds to a Set of ObjectIds for correct comparison
    const savedInvestorSet = new Set(savedInvestorIds.map(id => id.toString())); // Convert ObjectId to string

    // Filter investorIds to include only those that are not in the savedInvestorSet
    const newInvestorIds = new Set(investorIds.filter(id => !savedInvestorSet.has(id.toString()))); // Ensure each ID is a string


    const matches = Array.from(newInvestorIds).map(inv => ({
        fundingRequestId: fundingRequest._id,
        founderId: fundingRequest.founderId._id,
        investorId: inv,
        assignedBy: authenticatedUser._id,
        assignmentMethod: 'manual',
        status: 'active',
        contactedAt: new Date()
    }));

    await FounderInvestorMatch.insertMany(matches);
    console.log("available investorIds ",investorIds);
    // Try investor IDs first
    if (investorIds.length > 0) {
        const investorData = await InvestorService.getInvestorEmailsFromIds(investorIds);
        console.log('Investor data fetched:', investorData);
        if (investorData.length > 0) {
            allInvestorEmails = investorData.map(inv => inv.email);
            contactedInvestorIds = investorData.map(inv => inv.id);
            emailMethod = 'investor_ids';
        }
    }

    // Get pitch deck documents
    const documentsToSend = await PitchDeckService.getDocumentsForInvestorEmail(
        fundingRequest.founderId._id,
        specifiedPitchDeckDocumentIds,
        true
    );

    if (documentsToSend.length === 0) {
        throw new ValidationError('No pitch deck documents available to send');
    }

    // Prepare message
    const defaultMessage = `We would like to share our funding opportunity with you. ${founderProfile.companyName} is seeking ${fundingRequest.fundingStage} stage funding.`;
    const finalMessage = customEmailMessage || defaultMessage;

    // Send emails
    const emailResults = await SendPitchDeckHelper.sendPitchDeckToInvestors({
        founder: founderProfile,
        investorEmails: allInvestorEmails,
        pitchDeckDocumentIds: documentsToSend.map(doc => doc.documentId),
        customMessage: finalMessage,
        context,
        fundingRequestId: fundingRequest._id
    });

    // Return response
    return {
        message: emailResults.success ?
            'Successfully sent pitch deck to investors' :
            'Failed to send emails',
        data: {
            fundingRequestId: fundingRequest._id,
            fundingStage: fundingRequest.fundingStage,
            companyName: founderProfile.companyName,
            emailsSent: allInvestorEmails.length,
            contactedInvestors: contactedInvestorIds.length,
            documentsAttached: documentsToSend.length,
            emailMethod: emailMethod,
            emailResults: emailResults
        }
    };
}

// Simple input validation
function validateInput(req) {
    if (!req.body) {
        throw new ValidationError('Request body is required');
    }

    const { fundingRequestId, investorIds } = req.body;

    if (!fundingRequestId || typeof fundingRequestId !== 'string') {
        throw new ValidationError('Valid funding request ID is required');
    }

    const hasInvestorIds = investorIds && Array.isArray(investorIds) && investorIds.length > 0;

    if (!hasInvestorIds) {
        throw new ValidationError('At least one investor ID is required');
    }
}

module.exports = azureFunctionWrapper(sendToInvestorsHandler, {
    requireAuth: true,
    validateInput: validateInput,
    enableCors: true,
    timeout: 30000
});