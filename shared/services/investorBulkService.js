// shared/services/investorBulkService.js
const csv = require('csv-parser');
const { Readable } = require('stream');
const bcrypt = require('bcryptjs');
const InvestorProfile = require('../../models/sintracapInvestor');
const { ValidationError } = require('../middleware/errorHandler');

const DEFAULT_PASSWORD = 'TempPass123!';

class InvestorBulkService {
    
    static async processBulkInvestors(csvDataArray, investors, logger) {
        let investorsData = [];
        const results = {
            successful: [],
            updated: [],
            failed: [],
            skipped: [],
            totalProcessed: 0,
            successCount: 0,
            updatedCount: 0,
            failureCount: 0,
            skippedCount: 0
        };

        try {
            // Process data based on input type
            if (csvDataArray) {
                logger('Processing CSV data...');
                
                // Handle both single CSV string and array of CSV strings
                const csvArray = Array.isArray(csvDataArray) ? csvDataArray : [csvDataArray];
                logger(`Processing ${csvArray.length} CSV file(s)`);
                
                for (let i = 0; i < csvArray.length; i++) {
                    logger(`Processing CSV file ${i + 1}/${csvArray.length}`);
                    const csvInvestors = await this._processCsvData(csvArray[i]);
                    investorsData = investorsData.concat(csvInvestors);
                }
                
            } else if (investors) {
                logger('Processing manual investor data...');
                investorsData = investors.map(investor => ({
                    ...investor,
                    fetchedFromCSV: false
                }));
            }

            if (!investorsData.length) {
                throw new ValidationError('No valid investor data found');
            }

            logger(`Processing ${investorsData.length} investors from all sources`);
            results.totalProcessed = investorsData.length;

            // Hash default password once
            const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 12);

            // Process each investor
            for (const investorData of investorsData) {
                try {
                    // Basic validation
                    if (!investorData.email || !investorData.fullName) {
                        throw new Error('Email and fullName are required');
                    }

                    // Check for existing investor
                    const existingInvestor = await InvestorProfile.findOne({ 
                        email: investorData.email.toLowerCase() 
                    });

                    if (existingInvestor) {
                        // Update existing investor
                        logger(`Updating existing investor: ${investorData.email}`);
                        
                        const updateData = this._prepareUpdateData(investorData, existingInvestor);
                        
                        const updatedInvestor = await InvestorProfile.findByIdAndUpdate(
                            existingInvestor._id,
                            updateData,
                            { 
                                new: true,
                                runValidators: true 
                            }
                        );

                        results.updated.push({
                            id: updatedInvestor._id,
                            email: updatedInvestor.email,
                            fullName: updatedInvestor.fullName,
                            fetchedFromCSV: investorData.fetchedFromCSV,
                            updatedFields: Object.keys(updateData)
                        });
                        results.updatedCount++;

                        logger(`Updated investor: ${updatedInvestor.email}`);

                    } else {
                        // Create new investor
                        const newInvestorData = this._prepareInvestorData(investorData, hashedPassword);

                        const savedInvestor = await InvestorProfile.create(newInvestorData);

                        results.successful.push({
                            id: savedInvestor._id,
                            email: savedInvestor.email,
                            fullName: savedInvestor.fullName,
                            fetchedFromCSV: savedInvestor.fetchedFromCSV
                        });
                        results.successCount++;

                        logger(`Created investor: ${savedInvestor.email}`);
                    }

                } catch (error) {
                    logger(`Failed to process investor ${investorData.email}: ${error.message}`);
                    results.failed.push({
                        email: investorData.email || 'Unknown',
                        error: error.message,
                        data: investorData
                    });
                    results.failureCount++;
                }
            }

            const message = `Processed ${results.totalProcessed} investors. ` +
                           `Created: ${results.successCount}, ` +
                           `Updated: ${results.updatedCount}, ` +
                           `Failed: ${results.failureCount}`;

            return {
                message,
                defaultPassword: DEFAULT_PASSWORD,
                results,
                note: results.successCount > 0 ? 
                      'New investors created with default password. Please advise them to change it on first login.' :
                      'Existing investors updated with new data.'
            };

        } catch (error) {
            throw new ValidationError(`Bulk processing failed: ${error.message}`);
        }
    }

    // Prepare update data for existing investors
    static _prepareUpdateData(investorData, existingInvestor) {
        const updateData = {
            updatedAt: new Date()
        };

        // Update basic fields only if new data is provided and different
        const fieldsToUpdate = [
            'fullName', 'phone', 'linkedIn', 'company', 'designation', 
            'bio', 'location', 'amountRange', 'photoURL'
        ];

        fieldsToUpdate.forEach(field => {
            if (investorData[field] && investorData[field].trim() && 
                investorData[field].trim() !== existingInvestor[field]) {
                updateData[field] = investorData[field].trim();
            }
        });

        // Handle investment interests
        if (investorData.investmentInterests) {
            let newInterests = [];
            if (typeof investorData.investmentInterests === 'string') {
                const separator = investorData.investmentInterests.includes(';') ? ';' : ',';
                newInterests = investorData.investmentInterests
                    .split(separator)
                    .map(interest => interest.trim())
                    .filter(interest => interest.length > 0);
            } else if (Array.isArray(investorData.investmentInterests)) {
                newInterests = investorData.investmentInterests;
            }

            // Merge with existing interests (avoid duplicates)
            if (newInterests.length > 0) {
                const existingInterests = existingInvestor.investmentInterests || [];
                const mergedInterests = [...new Set([...existingInterests, ...newInterests])];
                updateData.investmentInterests = mergedInterests;
            }
        }

        // Handle previous investments
        if (investorData.previousInvestments) {
            let newInvestments = [];
            if (typeof investorData.previousInvestments === 'string') {
                newInvestments = this._parsePreviousInvestmentsString(investorData.previousInvestments);
            } else if (Array.isArray(investorData.previousInvestments)) {
                newInvestments = investorData.previousInvestments.map(investment => ({
                    companyName: investment.companyName?.trim(),
                    industry: investment.industry?.trim(),
                    stage: investment.stage?.trim(),
                    amountInvested: parseFloat(investment.amountInvested) || 0,
                    year: parseInt(investment.year) || new Date().getFullYear(),
                    status: investment.status || 'Active',
                    website: investment.website?.trim(),
                    logoURL: investment.logoURL?.trim()
                }));
            }

            // Merge with existing investments (avoid duplicates based on company name)
            if (newInvestments.length > 0) {
                const existingInvestments = existingInvestor.previousInvestments || [];
                const mergedInvestments = [...existingInvestments];
                
                newInvestments.forEach(newInvestment => {
                    const existingIndex = mergedInvestments.findIndex(
                        existing => existing.companyName?.toLowerCase() === newInvestment.companyName?.toLowerCase()
                    );
                    
                    if (existingIndex >= 0) {
                        // Update existing investment
                        mergedInvestments[existingIndex] = { ...mergedInvestments[existingIndex], ...newInvestment };
                    } else {
                        // Add new investment
                        mergedInvestments.push(newInvestment);
                    }
                });
                
                updateData.previousInvestments = mergedInvestments;
            }
        }

        // Handle notable exits
        if (investorData.notableExits) {
            let newExits = [];
            if (typeof investorData.notableExits === 'string') {
                const separator = investorData.notableExits.includes(';') ? ';' : ',';
                newExits = investorData.notableExits
                    .split(separator)
                    .map(exit => exit.trim())
                    .filter(exit => exit.length > 0);
            } else if (Array.isArray(investorData.notableExits)) {
                newExits = investorData.notableExits;
            }

            // Merge with existing exits (avoid duplicates)
            if (newExits.length > 0) {
                const existingExits = existingInvestor.notableExits || [];
                const mergedExits = [...new Set([...existingExits, ...newExits])];
                updateData.notableExits = mergedExits;
            }
        }

        // Update fetchedFromCSV flag if this update is from CSV
        if (investorData.fetchedFromCSV) {
            updateData.fetchedFromCSV = true;
        }

        return updateData;
    }

    // Process CSV data
    static async _processCsvData(csvData) {
        return new Promise((resolve, reject) => {
            const results = [];
            let csvContent = csvData;

            // Handle base64 encoded CSV
            if (csvData.startsWith('data:')) {
                const base64Data = csvData.split(',')[1];
                csvContent = Buffer.from(base64Data, 'base64').toString('utf-8');
            }

            const stream = Readable.from([csvContent]);

            stream
                .pipe(csv({
                    mapHeaders: ({ header }) => header.trim().toLowerCase().replace(/\s+/g, '')
                }))
                .on('data', (data) => {
                    const investorData = {
                        fullName: data.fullname || data.name || `${data.firstname || ''} ${data.lastname || ''}`.trim(),
                        email: data.email,
                        phone: data.phone || data.phonenumber,
                        linkedIn: data.linkedin || data.linkedinurl,
                        company: data.company || data.companyname,
                        designation: data.designation || data.title || data.position,
                        bio: data.bio || data.biography,
                        location: data.location || data.city,
                        investmentInterests: data.investmentinterests || data.interests,
                        amountRange: data.amountrange || data.investmentrange,
                        photoURL: data.photourl || data.imageurl,
                        previousInvestments: data.previousinvestments,
                        notableExits: data.notableexits || data.exits,
                        fetchedFromCSV: true
                    };

                    // Only add if email exists
                    if (investorData.email && investorData.email.trim()) {
                        results.push(investorData);
                    }
                })
                .on('end', () => resolve(results))
                .on('error', (error) => reject(new ValidationError(`CSV parsing failed: ${error.message}`)));
        });
    }

    // Prepare investor data for database (for new investors)
    static _prepareInvestorData(investorData, hashedPassword) {
        const data = {
            fullName: investorData.fullName?.trim(),
            email: investorData.email?.toLowerCase()?.trim(),
            phone: investorData.phone?.trim(),
            linkedIn: investorData.linkedIn?.trim(),
            company: investorData.company?.trim(),
            designation: investorData.designation?.trim(),
            bio: investorData.bio?.trim(),
            location: investorData.location?.trim(),
            amountRange: investorData.amountRange?.trim(),
            photoURL: investorData.photoURL?.trim(),
            password: hashedPassword,
            role: 'investor',
            fetchedFromCSV: true,
            isVerifiedByAdmin: false,
            emailVerified: false,
            signupStatus: 'role-selected',
            provider: 'email',
            agreedToTerms: false,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        // Handle investment interests
        if (investorData.investmentInterests) {
            if (typeof investorData.investmentInterests === 'string') {
                const separator = investorData.investmentInterests.includes(';') ? ';' : ',';
                data.investmentInterests = investorData.investmentInterests
                    .split(separator)
                    .map(interest => interest.trim())
                    .filter(interest => interest.length > 0);
            } else if (Array.isArray(investorData.investmentInterests)) {
                data.investmentInterests = investorData.investmentInterests;
            }
        }

        // Handle previous investments
        if (investorData.previousInvestments) {
            if (typeof investorData.previousInvestments === 'string') {
                data.previousInvestments = this._parsePreviousInvestmentsString(investorData.previousInvestments);
            } else if (Array.isArray(investorData.previousInvestments)) {
                data.previousInvestments = investorData.previousInvestments.map(investment => ({
                    companyName: investment.companyName?.trim(),
                    industry: investment.industry?.trim(),
                    stage: investment.stage?.trim(),
                    amountInvested: parseFloat(investment.amountInvested) || 0,
                    year: parseInt(investment.year) || new Date().getFullYear(),
                    status: investment.status || 'Active',
                    website: investment.website?.trim(),
                    logoURL: investment.logoURL?.trim()
                }));
            }
        }

        // Handle notable exits
        if (investorData.notableExits) {
            if (typeof investorData.notableExits === 'string') {
                const separator = investorData.notableExits.includes(';') ? ';' : ',';
                data.notableExits = investorData.notableExits
                    .split(separator)
                    .map(exit => exit.trim())
                    .filter(exit => exit.length > 0);
            } else if (Array.isArray(investorData.notableExits)) {
                data.notableExits = investorData.notableExits;
            }
        }

        return data;
    }

    // Parse previous investments from string format
    // Format: "CompanyName|Industry|Stage|Amount|Year|Status;NextCompany|Industry|Stage|Amount|Year|Status"
    static _parsePreviousInvestmentsString(investmentsString) {
        if (!investmentsString || typeof investmentsString !== 'string') {
            return [];
        }

        try {
            const investments = [];
            const investmentEntries = investmentsString.split(';');

            for (const entry of investmentEntries) {
                const parts = entry.trim().split('|');
                
                if (parts.length >= 4) { // Minimum required: company, industry, stage, amount
                    const investment = {
                        companyName: parts[0]?.trim() || '',
                        industry: parts[1]?.trim() || '',
                        stage: parts[2]?.trim() || '',
                        amountInvested: parseFloat(parts[3]) || 0,
                        year: parseInt(parts[4]) || new Date().getFullYear(),
                        status: parts[5]?.trim() || 'Active',
                        website: parts[6]?.trim() || '',
                        logoURL: parts[7]?.trim() || ''
                    };

                    // Only add if we have essential data
                    if (investment.companyName && investment.industry) {
                        investments.push(investment);
                    }
                }
            }

            return investments;
        } catch (error) {
            console.log('Error parsing previous investments:', error.message);
            return [];
        }
    }
}

module.exports = InvestorBulkService;