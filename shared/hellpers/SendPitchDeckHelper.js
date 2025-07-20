// shared/helpers/SendPitchDeckHelper.js
const { BlobServiceClient } = require('@azure/storage-blob');
const CompanyProfile = require('../../models/sintracapFounder');
const { ValidationError } = require('../middleware/errorHandler');
const { EmailApiService } = require('../services/EmailApiService');
const FounderInvestorMatch = require('../../models/founderInvestorMatch');
const InvestorProfile = require('../../models/sintracapInvestor');

class SendPitchDeckHelper {
    /**
     * Get Azure Blob Service Client with better error handling
     * @returns {Object} Azure Blob Service Client
     */
    static getBlobServiceClient() {
        const connectionString = "DefaultEndpointsProtocol=https;AccountName=sintracap;AccountKey=kGfGEuu7WUkWUkqXkvdceqzbTjI0a/dI+oEyboCIZDDkBdOtFo60E38hGLKnEzM8AB8Ww2qxi7UZ+AStrcDDHw==;EndpointSuffix=core.windows.net";
        
        if (!connectionString) {
            throw new Error('Azure Storage connection string is not configured');
        }
        
        try {
            return BlobServiceClient.fromConnectionString(connectionString);
        } catch (error) {
            throw new Error(`Failed to create blob service client: ${error.message}`);
        }
    }

    /**
     * Download document from Azure Blob Storage with retry mechanism
     * @param {string} documentUrl - The blob URL
     * @param {number} maxRetries - Maximum number of retry attempts
     * @returns {Promise<Buffer>} Document buffer
     */
    static async downloadDocumentFromBlob(documentUrl, maxRetries = 3) {
        if (!documentUrl) {
            throw new Error('Document URL is required');
        }

        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const blobServiceClient = this.getBlobServiceClient();
                const url = new URL(documentUrl);
                const pathParts = url.pathname.split('/').filter(part => part.length > 0);
                
                if (pathParts.length < 2) {
                    throw new Error('Invalid blob URL format');
                }
                
                const containerName = pathParts[0];
                const blobName = pathParts.slice(1).join('/');
                
                const containerClient = blobServiceClient.getContainerClient(containerName);
                const blobClient = containerClient.getBlobClient(blobName);
                
                // Check if blob exists
                const exists = await blobClient.exists();
                if (!exists) {
                    throw new Error(`Blob does not exist: ${blobName}`);
                }
                
                const downloadResponse = await blobClient.download();
                
                if (!downloadResponse.readableStreamBody) {
                    throw new Error('No readable stream returned from blob download');
                }
                
                const chunks = [];
                for await (const chunk of downloadResponse.readableStreamBody) {
                    chunks.push(chunk);
                }
                
                const buffer = Buffer.concat(chunks);
                
                if (buffer.length === 0) {
                    throw new Error('Downloaded document is empty');
                }
                
                return buffer;
                
            } catch (error) {
                lastError = error;
                console.log(`Download attempt ${attempt} failed: ${error.message}`);
                
                if (attempt < maxRetries) {
                    // Wait before retry (exponential backoff)
                    await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
                }
            }
        }
        
        throw new Error(`Failed to download document after ${maxRetries} attempts: ${lastError.message}`);
    }

    /**
     * Generate email HTML template for pitch deck
     * @param {Object} founder - Founder profile
     * @param {string} customMessage - Custom message from founder
     * @param {string} fundingRequestId - Optional funding request ID
     * @returns {string} HTML email template
     */
    static generatePitchDeckEmailTemplate(founder, customMessage, fundingRequestId = null) {
        // Input validation
        if (!founder) {
            throw new Error('Founder profile is required for email template');
        }
        
        const companyName = founder.companyName || 'Our Company';
        const industry = founder.industry || 'Technology';
        const website = founder.website ? `<a href="${founder.website}" target="_blank">${founder.website}</a>` : 'Website not provided';
        const safeCustomMessage = customMessage ? customMessage.replace(/[<>]/g, '') : '';
        
        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Investment Opportunity - ${companyName}</title>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
                
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                
                body { 
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; 
                    line-height: 1.6; 
                    color: #1f2937; 
                    background-color: #f9fafb;
                }
                
                .container {
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                }
                
                .email-wrapper {
                    background-color: #ffffff;
                    border-radius: 12px;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
                    overflow: hidden;
                }
                
                .header { 
                    background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); 
                    color: white; 
                    padding: 40px 30px; 
                    text-align: center;
                }
                
                .header h1 {
                    font-size: 28px;
                    font-weight: 700;
                    margin-bottom: 8px;
                }
                
                .header h2 {
                    font-size: 20px;
                    font-weight: 500;
                    opacity: 0.9;
                }
                
                .content { 
                    background: #ffffff; 
                    padding: 40px 30px;
                }
                
                .highlight { 
                    background-color: #f3f4f6; 
                    padding: 20px; 
                    border-left: 4px solid #3b82f6; 
                    margin: 24px 0; 
                    border-radius: 0 6px 6px 0;
                }
                
                .highlight p {
                    margin: 0;
                    font-style: italic;
                    color: #374151;
                }
                
                .button { 
                    display: inline-block; 
                    background: #3b82f6; 
                    color: white; 
                    padding: 12px 24px; 
                    text-decoration: none; 
                    border-radius: 6px; 
                    margin: 8px 8px 8px 0;
                    font-weight: 500;
                    transition: background-color 0.2s;
                }
                
                .button:hover {
                    background: #2563eb;
                }
                
                .company-info { 
                    background: #f9fafb; 
                    padding: 24px; 
                    border-radius: 8px; 
                    margin: 24px 0;
                    border: 1px solid #e5e7eb;
                }
                
                .company-info h3 {
                    font-size: 18px;
                    font-weight: 600;
                    margin-bottom: 16px;
                    color: #111827;
                }
                
                .info-row { 
                    margin: 10px 0;
                    display: flex;
                    align-items: center;
                }
                
                .label { 
                    font-weight: 600; 
                    color: #3b82f6;
                    min-width: 120px;
                    margin-right: 8px;
                }
                
                .footer { 
                    background: #f9fafb; 
                    padding: 24px 30px; 
                    text-align: center; 
                    font-size: 14px; 
                    color: #6b7280;
                    border-top: 1px solid #e5e7eb;
                }
                
                .footer p {
                    margin: 8px 0;
                }
                
                .cta-section {
                    text-align: center;
                    margin: 32px 0;
                    padding: 24px;
                    background: #f8fafc;
                    border-radius: 8px;
                }
                
                .about-section {
                    margin: 24px 0;
                    padding: 20px;
                    background: #fef3c7;
                    border-radius: 8px;
                    border-left: 4px solid #f59e0b;
                }
                
                .about-section h4 {
                    font-size: 16px;
                    font-weight: 600;
                    margin-bottom: 12px;
                    color: #92400e;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="email-wrapper">
                    <div class="header">
                        <h1>🚀 Investment Opportunity</h1>
                        <h2>${companyName}</h2>
                    </div>
                    
                    <div class="content">
                        <p>Dear Investor,</p>
                        
                        ${safeCustomMessage ? `<div class="highlight"><p>${safeCustomMessage}</p></div>` : ''}
                        
                        <p>We are excited to share our investment opportunity with you. Please find our comprehensive pitch deck attached to this email, which includes detailed information about our business model, market opportunity, financial projections, and growth strategy.</p>
                        
                        <div class="company-info">
                            <h3>📊 Company Overview</h3>
                            <div class="info-row"><span class="label">Company:</span> <span>${companyName}</span></div>
                            <div class="info-row"><span class="label">Industry:</span> <span>${industry}</span></div>
                            ${founder.sector ? `<div class="info-row"><span class="label">Sector:</span> <span>${founder.sector}</span></div>` : ''}
                            ${founder.fundingStage ? `<div class="info-row"><span class="label">Funding Stage:</span> <span>${founder.fundingStage}</span></div>` : ''}
                            ${founder.teamSize ? `<div class="info-row"><span class="label">Team Size:</span> <span>${founder.teamSize}</span></div>` : ''}
                            ${founder.foundedDate ? `<div class="info-row"><span class="label">Founded:</span> <span>${new Date(founder.foundedDate).getFullYear()}</span></div>` : ''}
                            <div class="info-row"><span class="label">Website:</span> <span>${website}</span></div>
                        </div>
                        
                        ${founder.description ? `<div class="about-section"><h4>💡 About Our Company</h4><p>${founder.description}</p></div>` : ''}
                        
                        <p>We believe this represents an exceptional investment opportunity with significant potential for returns. Our team has carefully developed a comprehensive business strategy that addresses a substantial market need with proven early traction.</p>
                        
                        <p><strong>Key highlights you'll find in our pitch deck:</strong></p>
                        <ul style="margin: 16px 0; padding-left: 24px; color: #374151;">
                            <li>Market analysis and opportunity sizing</li>
                            <li>Unique value proposition and competitive advantages</li>
                            <li>Business model and revenue streams</li>
                            <li>Financial projections and funding requirements</li>
                            <li>Team expertise and track record</li>
                            <li>Growth strategy and milestones</li>
                        </ul>
                        
                        <p>We would welcome the opportunity to discuss this investment opportunity in detail and answer any questions you may have.</p>
                        
                        <div class="cta-section">
                            <p style="margin-bottom: 16px; font-weight: 500;">Ready to learn more?</p>
                            ${founder.email ? `<a href="mailto:${founder.email}?subject=Investment Inquiry - ${companyName}" class="button">📧 Contact Us</a>` : ''}
                            ${founder.website ? `<a href="${founder.website}" class="button" target="_blank">🌐 Visit Website</a>` : ''}
                        </div>
                        
                        <p>Thank you for your time and consideration. We look forward to the possibility of partnering with you.</p>
                        
                        <p>Best regards,<br>
                        <strong>${companyName} Team</strong></p>
                    </div>
                    
                    <div class="footer">
                        <p><strong>📋 This email was sent through Sintracap's investment platform</strong></p>
                        ${fundingRequestId ? `<p>Reference ID: <code>${fundingRequestId}</code></p>` : ''}
                        <p>© ${new Date().getFullYear()} Sintracap. All rights reserved.</p>
                        <p style="font-size: 12px; margin-top: 16px;">
                            If you no longer wish to receive investment opportunities, please reply with "UNSUBSCRIBE".<br>
                            This email contains confidential and proprietary information. Please handle accordingly.
                        </p>
                    </div>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    /**
     * Generate plain text template for pitch deck email
     * @param {Object} founder - Founder profile
     * @param {string} customMessage - Custom message from founder
     * @param {string} fundingRequestId - Optional funding request ID
     * @returns {string} Plain text email template
     */
    static generatePitchDeckTextTemplate(founder, customMessage, fundingRequestId = null) {
        if (!founder) {
            throw new Error('Founder profile is required for text template');
        }
        
        const companyName = founder.companyName || 'Our Company';
        const industry = founder.industry || 'Technology';
        
        return `
INVESTMENT OPPORTUNITY - ${companyName}

Dear Investor,

${customMessage ? `${customMessage}\n\n` : ''}We are excited to share our investment opportunity with you. Please find our comprehensive pitch deck attached to this email.

COMPANY OVERVIEW:
- Company: ${companyName}
- Industry: ${industry}
${founder.sector ? `- Sector: ${founder.sector}\n` : ''}${founder.fundingStage ? `- Funding Stage: ${founder.fundingStage}\n` : ''}${founder.teamSize ? `- Team Size: ${founder.teamSize}\n` : ''}${founder.foundedDate ? `- Founded: ${new Date(founder.foundedDate).getFullYear()}\n` : ''}${founder.website ? `- Website: ${founder.website}\n` : ''}

${founder.description ? `ABOUT OUR COMPANY:\n${founder.description}\n\n` : ''}KEY HIGHLIGHTS IN OUR PITCH DECK:
• Market analysis and opportunity sizing
• Unique value proposition and competitive advantages
• Business model and revenue streams
• Financial projections and funding requirements
• Team expertise and track record
• Growth strategy and milestones

We believe this represents an exceptional investment opportunity with significant potential for returns.

We would welcome the opportunity to discuss this investment opportunity in detail and answer any questions you may have.

${founder.email ? `Contact us: ${founder.email}\n` : ''}${founder.website ? `Visit our website: ${founder.website}\n` : ''}

Thank you for your time and consideration. We look forward to the possibility of partnering with you.

Best regards,
${companyName} Team

---
This email was sent through Sintracap's investment platform
${fundingRequestId ? `Reference ID: ${fundingRequestId}\n` : ''}© ${new Date().getFullYear()} Sintracap. All rights reserved.

If you no longer wish to receive investment opportunities, please reply with "UNSUBSCRIBE".
        `.trim();
    }

    /**
     * Convert document buffer to base64 attachment format for EmailApiService
     * @param {Buffer} buffer - Document buffer
     * @param {string} filename - Original filename
     * @param {string} contentType - Content type
     * @returns {Object} Attachment object
     */
    static createEmailAttachment(buffer, filename, contentType) {
        if (!buffer || !Buffer.isBuffer(buffer)) {
            throw new Error('Valid buffer is required for attachment');
        }
        
        if (!filename || typeof filename !== 'string') {
            throw new Error('Valid filename is required for attachment');
        }
        
        return {
            filename: filename,
            content: buffer.toString('base64'),
            encoding: 'base64',
            contentType: contentType || 'application/octet-stream'
        };
    }

    /**
     * Send pitch deck to multiple investors using EmailApiService with improved error handling
     * @param {Object} params - Parameters object
     * @param {Object} params.founder - Founder profile
     * @param {Array} params.investorEmails - Array of investor email addresses
     * @param {Array} params.pitchDeckDocumentIds - Array of document IDs to send
     * @param {string} params.customMessage - Custom message from founder
     * @param {Object} params.context - Azure function context for logging
     * @param {string} params.fundingRequestId - Optional funding request ID
     * @returns {Promise<Object>} Email sending results
     */
    static async sendPitchDeckToInvestors({
        founder,
        investorEmails,
        pitchDeckDocumentIds,
        customMessage = '',
        context,
        fundingRequestId = null
    }) {
        // Enhanced validation
        if (!founder) {
            throw new ValidationError('Founder profile is required');
        }

        if (!investorEmails || !Array.isArray(investorEmails) || investorEmails.length === 0) {
            throw new ValidationError('At least one investor email is required');
        }

        if (!pitchDeckDocumentIds || !Array.isArray(pitchDeckDocumentIds) || pitchDeckDocumentIds.length === 0) {
            throw new ValidationError('At least one pitch deck document is required');
        }

        if (!context || typeof context.log !== 'function') {
            throw new ValidationError('Valid Azure function context is required');
        }

        // Validate and clean investor emails
        const validEmails = this.validateInvestorEmails(investorEmails);
        if (validEmails.length === 0) {
            throw new ValidationError('No valid investor email addresses found');
        }

        try {
            context.log(`Starting pitch deck send process for founder: ${founder._id || founder.id}`);
            
            // Get founder's complete profile with pitch deck documents
            const founderProfile = await CompanyProfile.findById(founder._id || founder.id)
                .select('pitchDeckDocuments companyName industry sector website email foundedDate teamSize fundingStage description');
            
            if (!founderProfile) {
                throw new ValidationError('Founder profile not found in database');
            }

            if (!founderProfile.pitchDeckDocuments || founderProfile.pitchDeckDocuments.length === 0) {
                throw new ValidationError('No pitch deck documents found for this founder');
            }

            // Filter and get the specified documents
            const documentsToSend = founderProfile.pitchDeckDocuments.filter(doc => 
                doc && doc.documentId && pitchDeckDocumentIds.includes(doc.documentId)
            );

            if (documentsToSend.length === 0) {
                throw new ValidationError('No valid pitch deck documents found for the specified IDs');
            }

            context.log(`Found ${documentsToSend.length} documents to send`);

            // Download all documents and create attachments with better error handling
            const attachments = [];
            const documentErrors = [];
            
            for (const doc of documentsToSend) {
                try {
                    if (!doc.url) {
                        documentErrors.push(`Document ${doc.name || doc.documentId} has no URL`);
                        continue;
                    }
                    
                    context.log(`Downloading document: ${doc.name}`);
                    const documentBuffer = await this.downloadDocumentFromBlob(doc.url);
                    const attachment = this.createEmailAttachment(documentBuffer, doc.name, doc.contentType || 'application/octet-stream');
                    attachments.push(attachment);
                    context.log(`Successfully prepared attachment: ${doc.name} (${documentBuffer.length} bytes)`);
                } catch (downloadError) {
                    const errorMsg = `Failed to download document ${doc.name}: ${downloadError.message}`;
                    context.log.error(errorMsg);
                    documentErrors.push(errorMsg);
                }
            }

            if (attachments.length === 0) {
                const errorMsg = `Failed to download any pitch deck documents. Errors: ${documentErrors.join('; ')}`;
                throw new Error(errorMsg);
            }

            if (documentErrors.length > 0) {
                context.log.warn(`Some documents failed to download: ${documentErrors.join('; ')}`);
            }

            // Generate email content with error handling
            let htmlContent, textContent, subject;
            try {
                htmlContent = this.generatePitchDeckEmailTemplate(founderProfile, customMessage, fundingRequestId);
                textContent = this.generatePitchDeckTextTemplate(founderProfile, customMessage, fundingRequestId);
                subject = `🚀 Investment Opportunity - ${founderProfile.companyName || 'Startup Investment'}`;
            } catch (templateError) {
                throw new Error(`Failed to generate email templates: ${templateError.message}`);
            }

            // Prepare email results tracking
            const emailResults = {
                success: true,
                message: '',
                data: {
                    totalEmails: validEmails.length,
                    successfulEmails: 0,
                    failedEmails: 0,
                    attachmentCount: attachments.length,
                    documentErrors: documentErrors,
                    results: []
                }
            };

            context.log(`Sending emails to ${validEmails.length} investors`);

            // Send emails with improved error handling and sequential processing
            const emailPromises = validEmails.map(async (email, index) => {
                try {
                    // Add delay between emails to avoid overwhelming email service
                    if (index > 0) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                    
                    context.log(`Sending pitch deck email to: ${email} (${index + 1}/${validEmails.length})`);
                    
                    // Find investor and match records with proper error handling
                    let investorId = null;
                    let match = null;
                    
                    try {
                        const investor = await InvestorProfile.findOne({ email: email }).select('_id');
                        if (investor) {
                            investorId = investor._id;
                            
                            if (fundingRequestId) {
                                match = await FounderInvestorMatch.findOne({ 
                                    fundingRequestId: fundingRequestId, 
                                    founderId: founder._id || founder.id, 
                                    investorId: investorId 
                                });
                            }
                        }
                    } catch (dbError) {
                        context.log.warn(`Database lookup failed for ${email}: ${dbError.message}`);
                    }

                    const emailData = {
                        to: email,
                        subject: subject,
                        htmlTemplate: htmlContent,
                        textTemplate: textContent,
                        from: `Sintracap <support@sintracap.com>`,
                        attachments: attachments
                    };

                    const result = await EmailApiService.sendEmail(emailData);
                    
                    // Update match record if found
                    if (match) {
                        try {
                            match.emailSent = true;
                            match.emailSentAt = new Date();
                            await match.save();
                        } catch (saveError) {
                            context.log.warn(`Failed to update match record for ${email}: ${saveError.message}`);
                        }
                    }
                    
                    emailResults.data.successfulEmails++;
                    emailResults.data.results.push({
                        email,
                        status: 'success',
                        sentAt: new Date(),
                        response: result
                    });

                    context.log(`Successfully sent email to: ${email}`);
                    return { email, status: 'success' };
                    
                } catch (error) {   
                    emailResults.data.failedEmails++;
                    emailResults.data.results.push({
                        email,
                        status: 'failed',
                        error: error.message,
                        sentAt: new Date()
                    });

                    context.log.error(`Failed to send email to ${email}: ${error.message}`);
                    return { email, status: 'failed', error: error.message };
                }
            });

            // Wait for all emails to complete
            await Promise.allSettled(emailPromises);

            // Update success status based on results
            if (emailResults.data.successfulEmails === 0) {
                emailResults.success = false;
                emailResults.message = 'Failed to send emails to any investors';
            } else if (emailResults.data.failedEmails > 0) {
                emailResults.message = `Partially successful: ${emailResults.data.successfulEmails}/${emailResults.data.totalEmails} emails sent`;
            } else {
                emailResults.message = `Successfully sent pitch deck to all ${emailResults.data.successfulEmails} investors`;
            }

            context.log(`Email sending completed: ${emailResults.message}`);
            return emailResults;

        } catch (error) {
            context.log.error('Error in sendPitchDeckToInvestors:', error);
            throw new Error(`Failed to send pitch deck emails: ${error.message}`);
        }
    }

    /**
     * Log pitch deck activity with enhanced details
     * @param {Object} founder - Founder profile
     * @param {Array} investorEmails - Array of investor emails
     * @param {Object} emailResults - Results from email sending
     * @param {Object} context - Azure function context
     */
    static async logPitchDeckActivity(founder, investorEmails, emailResults, context) {
        try {
            const logData = {
                founderId: founder._id || founder.id,
                companyName: founder.companyName,
                emailCount: investorEmails.length,
                validEmailCount: emailResults.data?.totalEmails || 0,
                successCount: emailResults.data?.successfulEmails || 0,
                failCount: emailResults.data?.failedEmails || 0,
                attachmentCount: emailResults.data?.attachmentCount || 0,
                documentErrors: emailResults.data?.documentErrors || [],
                timestamp: new Date().toISOString(),
                success: emailResults.success
            };

            context.log('Pitch deck activity logged:', logData);

            // Log individual email results for debugging
            if (emailResults.data?.results) {
                const failedEmails = emailResults.data.results
                    .filter(result => result.status === 'failed')
                    .map(result => ({ email: result.email, error: result.error }));
                
                if (failedEmails.length > 0) {
                    context.log('Failed email details:', failedEmails);
                }
            }

        } catch (error) {
            context.log.error('Failed to log pitch deck activity:', error);
            // Don't throw error as this is just logging
        }
    }

    /**
     * Validate investor email addresses with improved validation
     * @param {Array} emails - Array of email addresses
     * @returns {Array} Array of valid email addresses
     */
    static validateInvestorEmails(emails) {
        if (!emails || !Array.isArray(emails)) {
            return [];
        }
        
        return emails
            .filter(email => email && typeof email === 'string')
            .map(email => email.trim().toLowerCase())
            .filter(email => {
                // More comprehensive email validation
                const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
                return emailRegex.test(email) && email.length <= 254; // RFC 5321 limit
            })
            .filter((email, index, self) => self.indexOf(email) === index); // Remove duplicates
    }

    /**
     * Get email template preview with error handling
     * @param {Object} founder - Founder profile
     * @param {string} customMessage - Custom message
     * @param {string} fundingRequestId - Optional funding request ID
     * @returns {Object} HTML and text previews
     */
    static getEmailPreview(founder, customMessage = '', fundingRequestId = null) {
        try {
            return {
                html: this.generatePitchDeckEmailTemplate(founder, customMessage, fundingRequestId),
                text: this.generatePitchDeckTextTemplate(founder, customMessage, fundingRequestId)
            };
        } catch (error) {
            throw new Error(`Failed to generate email preview: ${error.message}`);
        }
    }

    /**
     * Health check method to validate service dependencies
     * @param {Object} context - Azure function context
     * @returns {Promise<Object>} Health check results
     */
    static async healthCheck(context) {
        const results = {
            azureStorage: false,
            emailService: false,
            database: false,
            errors: []
        };

        try {
            // Check Azure Storage
            const blobServiceClient = this.getBlobServiceClient();
            await blobServiceClient.getAccountInfo();
            results.azureStorage = true;
        } catch (error) {
            results.errors.push(`Azure Storage: ${error.message}`);
        }

        try {
            // Check database connection
            await CompanyProfile.findOne().limit(1);
            results.database = true;
        } catch (error) {
            results.errors.push(`Database: ${error.message}`);
        }

        // Note: EmailApiService health check would need to be implemented separately
        // based on the specific email service being used

        const isHealthy = results.azureStorage && results.database;
        
        if (context) {
            context.log('Health check completed:', { isHealthy, results });
        }

        return { isHealthy, results };
    }
}

module.exports = SendPitchDeckHelper;