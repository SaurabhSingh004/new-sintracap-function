const {
    azureFunctionWrapper,
    ValidationError,
    ensureDbConnection
} = require('../shared/middleware/errorHandler');
const dbConfig = require('../shared/config/db.config');
const FundingRequest = require('../models/fundingRequest');
const CompanyProfile = require('../models/sintracapFounder');
const FounderInvestorMatch = require('../models/founderInvestorMatch');
const Notification = require('../models/notification');
const authenticateToken = require('../shared/middleware/authenticateToken');
const SendPitchDeckHelper = require('../shared/hellpers/SendPitchDeckHelper');
const PitchDeckService = require('../shared/services/PitchDeckService');
const InvestorService = require('../shared/services/InvestorService');

// Main function handler
async function createFundingRequestHandler(context, req) {
    // Ensure database connection
    await ensureDbConnection(dbConfig, context);

    const authenticatedUser = await authenticateToken(context, req);
    if (!authenticatedUser) {
        return; // Response already set by authenticateToken middleware
    }

    const {
        fundingStage,
        useOfFunds,
        businessPlan,
        financialProjections,
        additionalNotes,
        // New primary fields for investor IDs
        sendToInvestorsImmediately = false,
        investorIds = [], // Primary method: investor IDs
        customEmailMessage = '',
        specifiedPitchDeckDocumentIds = []
    } = req.body;

    let { founderId } = req.body;
    if (authenticatedUser.role === 'admin') {
        founderId = founderId;
    } else {
        founderId = authenticatedUser._id;
    }

    // Check if founder has a complete profile
    const founderProfile = await CompanyProfile.findById(founderId);
    if (!founderProfile) {
        throw new ValidationError('Founder profile not found');
    }

    if (founderProfile.signupStatus !== 'complete') {
        throw new ValidationError('Please complete your profile before creating funding requests');
    }

    // Check if founder has any active funding requests
    const existingActiveRequest = await FundingRequest.findOne({
        founderId: founderId,
        status: { $in: ['open', 'allotted'] }
    });

    if (existingActiveRequest) {
        throw new ValidationError('You already have an active funding request. Please close it before creating a new one.');
    }

    // Create funding request
    const fundingRequest = new FundingRequest({
        founderId: founderId,
        fundingStage,
        useOfFunds,
        businessPlan,
        financialProjections,
        additionalNotes,
        status: 'open'
    });

    await fundingRequest.save();

    // Handle sending pitch deck to investors if requested
    let emailResults = null;
    if (sendToInvestorsImmediately && investorIds.length > 0) {
        try {
            let allInvestorEmails = [];
            let contactedInvestorIds = [];
            let emailMethod = 'direct_emails';

            // Priority 1: Use investor IDs if provided (new preferred method)
            if (investorIds.length > 0) {
                context.log(`Processing ${investorIds.length} investor IDs for immediate sending`);

                // Validate investor IDs exist
                const { found, missing } = await InvestorService.validateInvestorIds(investorIds);

                // Log any missing IDs
                if (missing.length > 0) {
                    context.log.warn(`Some investor IDs not found: ${missing.join(', ')}`);
                }

                // If none were valid, error out
                if (found.length === 0) {
                    throw new ValidationError('No valid investor IDs found in database');
                }

                const matches = investorIds.map(inv => ({
                    fundingRequestId: fundingRequest._id,
                    founderId: founderId,
                    investorId: inv,
                    assignedBy: authenticatedUser._id,
                    assignmentMethod: 'manual',
                    status: 'active',
                    contactedAt: new Date()
                }));

                await FounderInvestorMatch.insertMany(matches);


                // Get contactable investors
                const investorData = await InvestorService.getInvestorEmailsFromIds(investorIds, true);
                allInvestorEmails = investorData.map(inv => inv.email);
                contactedInvestorIds = investorData.map(inv => inv.id);
                emailMethod = 'investor_ids';

                context.log(`Found ${allInvestorEmails.length} contactable investors from ${investorIds.length} valid IDs`);

                if (allInvestorEmails.length === 0) {
                    throw new ValidationError('No contactable investors found from the provided IDs');
                }
            }

            if (allInvestorEmails.length === 0) {
                throw new ValidationError('No valid investor contacts found');
            }

            // Get pitch deck documents from database using the service
            const documentsToSend = await PitchDeckService.getDocumentsForInvestorEmail(
                founderId,
                specifiedPitchDeckDocumentIds,
                true // prefer verified documents
            );

            if (documentsToSend.length === 0) {
                context.log.warn('No pitch deck documents available to send');
                emailResults = {
                    success: false,
                    message: 'No pitch deck documents available to send to investors',
                    data: { warning: 'No documents found in database' }
                };
            } else {
                context.log(`Sending pitch deck with ${documentsToSend.length} documents to ${allInvestorEmails.length} investors for funding request ${fundingRequest._id}`);

                // Extract document IDs for the email helper
                const documentIds = documentsToSend.map(doc => doc.documentId);

                // Prepare custom message
                const defaultMessage = `New funding request created: ${founderProfile.companyName} seeking ${fundingStage} stage funding.`;
                const finalCustomMessage = customEmailMessage || defaultMessage;

                emailResults = await SendPitchDeckHelper.sendPitchDeckToInvestors({
                    founder: founderProfile,
                    investorEmails: allInvestorEmails,
                    pitchDeckDocumentIds: documentIds,
                    customMessage: finalCustomMessage,
                    context,
                    fundingRequestId: fundingRequest._id
                });

                // Log the activity
                SendPitchDeckHelper.logPitchDeckActivity(founderProfile, allInvestorEmails, emailResults, context);
                context.log(`Email sending completed: ${emailResults.message}`);
            }
        } catch (emailError) {
            context.log.error('Error sending pitch deck emails:', emailError);
            // Don't fail the entire request for email errors
            emailResults = {
                success: false,
                message: `Failed to send pitch deck: ${emailError.message}`,
                data: { error: emailError.message }
            };
        }
    }

    // Create notification for admin about new funding request
    // const adminNotification = new Notification({
    //     recipientId: null, // This would be admin ID if you have admin users
    //     recipientType: 'admin',
    //     type: 'funding_request_created',
    //     title: 'New Funding Request Created',
    //     message: `${founderProfile.companyName} has created a new funding request at ${fundingStage} stage.`,
    //     relatedEntityId: fundingRequest._id,
    //     relatedEntityType: 'funding_request',
    //     priority: 'medium',
    //     actionUrl: `/admin/funding-requests/${fundingRequest._id}`,
    //     actionText: 'Review Request'
    // });

    // await adminNotification.save();

    // Populate the response with founder details
    await fundingRequest.populate('founderId', 'companyName industry sector foundedDate teamSize website');

    const response = {
        message: 'Funding request created successfully',
        data: {
            fundingRequest: {
                _id: fundingRequest._id,
                fundingStage: fundingRequest.fundingStage,
                useOfFunds: fundingRequest.useOfFunds,
                status: fundingRequest.status,
                refreshCount: fundingRequest.refreshCount,
                createdAt: fundingRequest.createdAt,
                founder: fundingRequest.founderId,
                contactedInvestorsCount: fundingRequest.getContactedInvestorsCount(),
                totalEmailsSent: fundingRequest.getTotalEmailsSent()
            }
        }
    };

    // Include email results if emails were sent
    if (emailResults) {
        response.data.emailResults = emailResults;
    }

    return response;
}

// Input validation function
function validateCreateFundingRequestInput(req) {
    if (!req.body) {
        throw new ValidationError('Request body is required');
    }

    const {
        fundingStage,
        useOfFunds,
        sendToInvestorsImmediately,
        investorIds,
        investors
    } = req.body;

    // Check required fields
    if (!fundingStage) {
        throw new ValidationError('Funding stage is required');
    }

    if (!useOfFunds || useOfFunds.trim().length === 0) {
        throw new ValidationError('Use of funds is required');
    }

    // Validate investor information if sending immediately
    if (sendToInvestorsImmediately) {
        const hasInvestorIds = investorIds && Array.isArray(investorIds) && investorIds.length > 0;

        if (!hasInvestorIds) {
            throw new ValidationError('When sending to investors immediately, at least one investor ID is required');
        }

        // Validate investor ID format if provided
        if (hasInvestorIds) {
            const invalidIds = investorIds.filter(id =>
                !id || typeof id !== 'string' || id.trim().length === 0
            );
            if (invalidIds.length > 0) {
                throw new ValidationError('All investor IDs must be valid strings');
            }
        }
    }
}

// Export wrapped function
module.exports = azureFunctionWrapper(createFundingRequestHandler, {
    requireAuth: true,
    validateInput: validateCreateFundingRequestInput,
    enableCors: true,
    timeout: 15000
});