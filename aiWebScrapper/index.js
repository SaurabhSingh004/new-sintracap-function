// aiWebScrapper/index.js
const { 
    azureFunctionWrapper, 
    validateEmail, 
    validateRequired,
    ValidationError,
    ensureDbConnection 
} = require('../shared/middleware/errorHandler');
const scraperService = require('../shared/services/scraperservice');
const openaiService = require('../shared/services/openaiService');
const profileService = require('../shared/services/profileService');
const requestService = require('../shared/services/requestService');
const AuthService = require('../shared/services/authService');
const dbConfig = require('../shared/config/db.config');

// Main function handler
async function aiWebScrapperHandler(context, req) {
    // Ensure database connection
    await ensureDbConnection(dbConfig, context);
    
    // Extract and validate parameters
    const { link, rawData, role, email, documentUrls } = req.body;
    
    const validatedEmail = validateEmail(email);
    const validatedRole = validateRequired(role, 'role');
    
    // Validate role is correct
    if (!['investor', 'founder'].includes(validatedRole)) {
        throw new ValidationError('Role must be either "investor" or "founder"');
    }
    
    // Validate we have content to process
    if (!link && !rawData) {
        throw new ValidationError('Either link or rawData must be provided');
    }
    
    // Gather content to process
    let contentToProcess = '';
    
    if (link) {
        context.log(`Scraping content from: ${link}`);
        contentToProcess = await scraperService.scrapeContent(link);
        
        if (!contentToProcess) {
            throw new ValidationError('Failed to scrape content from the provided link');
        }
    }
    
    if (rawData) {
        context.log('Processing raw data');
        contentToProcess += contentToProcess ? `\n\n${rawData}` : rawData;
    }
    
    // Process content with OpenAI
    const processedData = await openaiService.processContent(contentToProcess, validatedRole);
    if (!processedData) {
        throw new ValidationError('Failed to process content with AI');
    }
    
    // Add email and update profile
    processedData.email = validatedEmail;
    const profileData = await profileService.updateUserProfile(processedData, validatedRole, documentUrls);
    
    // Optional: Finalize signup if needed
    // const result = await AuthService.finalizeSignup(validatedEmail);
    
    return {
        message: 'Profile updated successfully with AI-processed data',
        data: profileData
    };
}

// Input validation function
function validateAiWebScrapperInput(req) {
    if (!req.body) {
        throw new ValidationError('Request body is required');
    }
    
    // Use request service validation if it exists
    const validation = requestService.validateRequest(req);
    if (!validation.isValid) {
        throw new ValidationError(validation.error);
    }
    
    const { email, role, link, rawData } = req.body;
    
    // Check required fields
    if (!email) {
        throw new ValidationError('Email is required');
    }
    
    if (!role) {
        throw new ValidationError('Role is required');
    }
    
    if (!link && !rawData) {
        throw new ValidationError('Either link or rawData must be provided');
    }
}

// Export wrapped function
module.exports = azureFunctionWrapper(aiWebScrapperHandler, {
    requireAuth: false,
    validateInput: validateAiWebScrapperInput,
    enableCors: true,
    timeout: 60000 // 60 seconds for AI processing and web scraping
});