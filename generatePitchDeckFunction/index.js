    // generate-pitch-deck-function/index.js
const { 
    azureFunctionWrapper,
    ensureDbConnection,
    ValidationError 
} = require('../shared/middleware/errorHandler');
const dbConfig = require('../shared/config/db.config');
const PitchDeckGeneratorHelper = require('../shared/hellpers/PitchDeckGeneratorHelper');
const authenticateToken = require('../shared/middleware/authenticateToken');

// Main function handler
async function generatePitchDeckHandler(context, req) {
    
    await ensureDbConnection(dbConfig, context);
    context.log('Generate Pitch Deck function processed a request.');
    
    const authenticatedUser = await authenticateToken(context, req);
        if (!authenticatedUser) {
            return; // Response already set by authenticateToken middleware
        }
    let { 
        founderId, 
        theme = 'light' 
    } = req.body || {};
    if (authenticatedUser.role === 'admin') {
        founderId = founderId;
    } else {
        founderId = authenticatedUser._id;
    }
    console.log('Authenticated user:', authenticatedUser);
    console.log('Request body:', founderId);
    // Validate request method
    if (req.method !== 'POST') {
        throw new ValidationError('Only POST method is allowed');
    }
    
    // Validate required parameters
    if (!founderId) {
        throw new ValidationError('founderId is required');
    }
    
    // Validate theme
    const allowedThemes = ['light', 'dark'];
    if (!allowedThemes.includes(theme)) {
        throw new ValidationError(`theme must be one of: ${allowedThemes.join(', ')}`);
    }
    
    context.log('Request parameters:', {
        founderId,
        theme
    });
    
    try {
        // Call the main orchestration function
        const result = await PitchDeckGeneratorHelper.generatePitchDeckFromDocument({
            founderId,
            theme,
            context
        });
        
        context.log('Pitch deck generation completed successfully');
        
        return {
            success: true,
            message: result.message,
            data: {
                documentId: result.data.generatedPitchDeck.documentId,
                pitchDeckUrl: result.data.generatedPitchDeck.url,
                filename: result.data.generatedPitchDeck.filename,
                size: result.data.generatedPitchDeck.size,
                sectionsGenerated: result.data.generationDetails.sectionsGenerated,
                theme: result.data.generationDetails.theme,
                companyName: result.data.generationDetails.companyName,
                originalDocument: result.data.originalDocument
            },
            // Include additional details for debugging/monitoring
            metadata: {
                processedAt: new Date().toISOString(),
                founderId,
                theme
            }
        };
        
    } catch (error) {
        context.log.error('Error in generate pitch deck function:', error);
        
        // Re-throw ValidationErrors as-is
        if (error instanceof ValidationError) {
            throw error;
        }
        
        // Handle specific error types
        if (error.message.includes('timeout') || error.message.includes('timed out')) {
            throw new Error('The pitch deck generation process timed out. This may happen with large documents or during high server load. Please try again.');
        }
        
        if (error.message.includes('not found')) {
            throw new ValidationError('The specified founder or document was not found');
        }
        
        if (error.message.includes('upload failed') || error.message.includes('download failed')) {
            throw new Error('There was an issue with file transfer. Please check the document URL and try again.');
        }
        
        // Generic error for unhandled cases
        throw new Error(`Pitch deck generation failed: ${error.message}`);
    }
}


// Export wrapped function with extended timeout for long-running process
module.exports = azureFunctionWrapper(generatePitchDeckHandler, {
    requireAuth: false, // Set to true if authentication is required
    validateInput: null,
    enableCors: true,
    timeout: 300000 // 5 minutes timeout to handle the 2+ minute generation process
});