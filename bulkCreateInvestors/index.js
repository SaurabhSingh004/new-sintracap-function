// bulkCreateInvestors/index.js
const { 
    azureFunctionWrapper,
    validateRequired,
    ValidationError,
    ensureDbConnection 
} = require('../shared/middleware/errorHandler');
const dbConfig = require('../shared/config/db.config');
const InvestorBulkService = require('../shared/services/investorBulkService');

// Main function handler - handles HTTP concerns and file uploads
async function bulkCreateInvestorsHandler(context, req) {
    try {
        // Ensure database connection
        await ensureDbConnection(dbConfig, context);
        
        let csvDataArray = null;
        let investors = null;

        // Check content type to determine how to handle the request
        const contentType = req.headers['content-type'] || '';
        
        if (contentType.includes('multipart/form-data')) {
            // Handle file upload - extract CSV content from multipart data
            context.log('Processing CSV file upload...');
            
            csvDataArray = extractCsvFilesFromMultipart(req.rawBody || req.body, context);
            
            if (!csvDataArray || csvDataArray.length === 0) {
                throw new ValidationError('Could not extract CSV content from uploaded file(s)');
            }
            
            context.log(`Found ${csvDataArray.length} CSV file(s) to process`);
            
        } else if (contentType.includes('application/json')) {
            // Handle JSON request body (existing functionality)
            context.log('Processing JSON request body...');
            
            if (!req.body) {
                throw new ValidationError('Request body is required');
            }
            
            // Support both single CSV and array of CSVs in JSON
            if (req.body.csvData) {
                csvDataArray = Array.isArray(req.body.csvData) ? req.body.csvData : [req.body.csvData];
            } else if (req.body.csvDataArray) {
                csvDataArray = req.body.csvDataArray;
            }
            
            investors = req.body.investors;
            
        } else {
            // Handle raw CSV content
            context.log('Processing raw CSV content...');
            
            if (req.rawBody) {
                csvDataArray = [req.rawBody.toString('utf-8')];
            } else if (typeof req.body === 'string') {
                csvDataArray = [req.body];
            } else {
                throw new ValidationError('Invalid content type. Use multipart/form-data for file upload or application/json for JSON data');
            }
        }
        
        // Validate that we have either CSV data or investors array
        if (!csvDataArray && !investors) {
            throw new ValidationError('Either CSV file(s)/data or investors array is required');
        }
        
        // Delegate to service layer
        const result = await InvestorBulkService.processBulkInvestors(csvDataArray, investors, context.log);
        
        return result;
        
    } catch (error) {
        context.log.error('Error in bulkCreateInvestorsHandler:', error.message);
        throw error;
    }
}

// Function to extract multiple CSV files from multipart/form-data
function extractCsvFilesFromMultipart(rawBody, context) {
    try {
        let body;
        
        // Convert to string if it's a buffer
        if (Buffer.isBuffer(rawBody)) {
            body = rawBody.toString('utf-8');
        } else if (typeof rawBody === 'string') {
            body = rawBody;
        } else {
            context.log.error('Invalid raw body type:', typeof rawBody);
            return [];
        }
        
        context.log('Raw body length:', body.length);
        context.log('Raw body preview:', body.substring(0, 200));
        
        // Find the boundary
        const boundaryMatch = body.match(/^-+(\w+)/);
        if (!boundaryMatch) {
            context.log.error('Could not find multipart boundary');
            return [];
        }
        
        const boundary = `--${boundaryMatch[1]}`;
        context.log('Found boundary:', boundary);
        
        // Split by boundary
        const parts = body.split(boundary);
        const csvFiles = [];
        
        // Find all parts that contain CSV files
        for (const part of parts) {
            // Look for CSV file parts - can be named 'csvFile', 'csvFiles', or 'files'
            if ((part.includes('name="csvFile') || 
                 part.includes('name="csvFiles') || 
                 part.includes('name="files')) && 
                part.includes('Content-Type:')) {
                
                context.log('Found CSV file part');
                
                // Extract content after the headers (double CRLF)
                const headerEndIndex = part.indexOf('\r\n\r\n');
                if (headerEndIndex !== -1) {
                    let csvContent = part.substring(headerEndIndex + 4);
                    
                    // Remove trailing boundary and CRLF
                    csvContent = csvContent.replace(/\r?\n?-+.*$/, '').trim();
                    
                    if (csvContent && csvContent.length > 0) {
                        context.log(`Extracted CSV content length: ${csvContent.length}`);
                        context.log('CSV content preview:', csvContent.substring(0, 100));
                        csvFiles.push(csvContent);
                    }
                }
            }
        }
        
        context.log(`Found ${csvFiles.length} CSV file(s)`);
        return csvFiles;
        
    } catch (error) {
        context.log.error('Error extracting CSV files from multipart:', error.message);
        return [];
    }
}

// Updated input validation for multiple content types and files
function validateBulkCreateInput(req) {
    const contentType = req.headers['content-type'] || '';
    
    if (contentType.includes('multipart/form-data')) {
        // For multipart, we'll validate after extraction
        return;
    }
    
    if (contentType.includes('application/json')) {
        // Validate JSON body
        if (!req.body) {
            throw new ValidationError('Request body is required');
        }

        const { csvData, csvDataArray, investors } = req.body;

        // Check if we have either CSV data (single or array) or investors array
        const hasCsvData = csvData || csvDataArray;
        const hasInvestors = investors && Array.isArray(investors);

        if (!hasCsvData && !hasInvestors) {
            throw new ValidationError('Either csvData/csvDataArray (string/array) or investors (array) is required');
        }

        if (hasInvestors && investors.length === 0) {
            throw new ValidationError('Investors array cannot be empty');
        }

        // Validate csvDataArray if provided
        if (csvDataArray && !Array.isArray(csvDataArray)) {
            throw new ValidationError('csvDataArray must be an array of strings');
        }

        return;
    }
    
    // For raw CSV content
    if (!req.rawBody && !req.body) {
        throw new ValidationError('CSV content is required');
    }
}

module.exports = azureFunctionWrapper(bulkCreateInvestorsHandler, {
    requireAuth: false,
    validateInput: validateBulkCreateInput,
    enableCors: true,
    timeout: 300000
});