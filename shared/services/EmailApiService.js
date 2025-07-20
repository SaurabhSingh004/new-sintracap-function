const axios = require('axios');

class EmailApiService {
    // Static configuration
    static emailConfig = {
        apiUrl: process.env.EMAIL_SERVICE_URL || 'https://otpmicroservice.azurewebsites.net/api/send-email',
        defaultCredentials: {
            service: "gmail",
            user: process.env.EMAIL_USER,
            password: process.env.HOST_PASS
        },
        defaultFrom: process.env.EMAIL_FROM || "ActoFit Team <himanshu@actofit.com>",
        timeout: 120000 // 2 minutes timeout
    };

    /**
     * Static method to send emails via Azure Function API
     * @param {Object} emailData - Email configuration
     * @returns {Promise<Object>} - API response
     */
    static async sendEmail(emailData) {
        try {
            const {
                to,
                subject,
                htmlTemplate,
                textTemplate,
                from,
                cc = null,
                bcc = null,
                attachments = null,
                emailCredentials = EmailApiService.emailConfig.defaultCredentials
            } = emailData;

            // Validate required fields
            if (!to || !subject) {
                throw new Error('Missing required fields: to and subject are mandatory');
            }

            if (!htmlTemplate && !textTemplate) {
                throw new Error('At least one template (htmlTemplate or textTemplate) is required');
            }

            // Prepare request payload
            const payload = {
                to,
                subject,
                htmlTemplate,
                textTemplate,
                from,
                emailCredentials
            };

            // Add optional fields only if they exist
            if (cc) payload.cc = cc;
            if (bcc) payload.bcc = bcc;
            if (attachments) payload.attachments = attachments;

            console.log('Sending email request to:', EmailApiService.emailConfig.apiUrl);
            console.log('Email payload:', {
                ...payload,
                emailCredentials: { ...payload.emailCredentials, password: '[HIDDEN]' }
            });

            // Make API call to Azure Function
            const response = await axios.post(EmailApiService.emailConfig.apiUrl, payload, {
                timeout: EmailApiService.emailConfig.timeout,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });

            console.log('Email API Response:', response.data);
            return response.data;

        } catch (error) {
            console.error('Email API Error:', error.message);

            if (error.response) {
                // API returned an error response
                console.error('API Error Response:', error.response.data);
                throw new Error(`Email service error: ${error.response.data.message || error.response.statusText}`);
            } else if (error.request) {
                // Request was made but no response received
                console.error('No response from email service');
                throw new Error('Email service is not responding. Please try again later.');
            } else {
                // Something else happened
                throw new Error(`Email configuration error: ${error.message}`);
            }
        }
    }

    /**
     * Static method to generate HTML template for password reset email
     * @param {string} otp - One-time password
     * @param {string} userEmail - User's email address
     * @returns {string} - HTML template
     */
    static generatePasswordResetHtmlTemplate(otp, userEmail) {
        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Password Reset Request</title>
            <style>
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                    background-color: #f4f4f4;
                }
                .email-container {
                    background: white;
                    padding: 30px;
                    border-radius: 10px;
                    box-shadow: 0 0 20px rgba(0,0,0,0.1);
                }
                .header {
                    text-align: center;
                    border-bottom: 3px solid #007bff;
                    padding-bottom: 20px;
                    margin-bottom: 30px;
                }
                .logo {
                    font-size: 28px;
                    font-weight: bold;
                    color: #007bff;
                    margin-bottom: 10px;
                }
                .otp-container {
                    background: #f8f9fa;
                    border: 2px dashed #007bff;
                    border-radius: 8px;
                    padding: 20px;
                    text-align: center;
                    margin: 25px 0;
                }
                .otp-code {
                    font-size: 32px;
                    font-weight: bold;
                    color: #007bff;
                    letter-spacing: 5px;
                    margin: 10px 0;
                }
                .warning {
                    background: #fff3cd;
                    border: 1px solid #ffeaa7;
                    color: #856404;
                    padding: 15px;
                    border-radius: 5px;
                    margin: 20px 0;
                }
                .footer {
                    margin-top: 30px;
                    padding-top: 20px;
                    border-top: 1px solid #eee;
                    text-align: center;
                    color: #666;
                    font-size: 14px;
                }
                .button {
                    display: inline-block;
                    background: #007bff;
                    color: white;
                    padding: 12px 25px;
                    text-decoration: none;
                    border-radius: 5px;
                    margin: 15px 0;
                }
            </style>
        </head>
        <body>
            <div class="email-container">
                <div class="header">
                    <div class="logo">🔐 ActoFit</div>
                    <h1>Password Reset Request</h1>
                </div>
                
                <p>Hello,</p>
                
                <p>We received a request to reset the password for your ActoFit account associated with <strong>${userEmail}</strong>.</p>
                
                <p>Please use the following One-Time Password (OTP) to reset your password:</p>
                
                <div class="otp-container">
                    <p>Your OTP Code:</p>
                    <div class="otp-code">${otp}</div>
                    <p><small>Valid for 60 minutes</small></p>
                </div>
                
                <div class="warning">
                    <strong>⚠️ Security Notice:</strong>
                    <ul style="margin: 10px 0; padding-left: 20px;">
                        <li>This OTP is valid for 60 minutes only</li>
                        <li>Do not share this code with anyone</li>
                        <li>If you didn't request this reset, please ignore this email</li>
                        <li>For security, this link will expire soon</li>
                    </ul>
                </div>
                
                <p>If you have any questions or need assistance, please contact our support team.</p>
                
                <div class="footer">
                    <p>
                        This email was sent from ActoFit Security System<br>
                        <small>© ${new Date().getFullYear()} ActoFit. All rights reserved.</small>
                    </p>
                    <p>
                        <small>
                            If you didn't request this password reset, you can safely ignore this email.
                            Your password will remain unchanged.
                        </small>
                    </p>
                </div>
            </div>
        </body>
        </html>`;
    }

    /**
     * Static method to generate plain text template for password reset email
     * @param {string} otp - One-time password
     * @param {string} userEmail - User's email address
     * @returns {string} - Plain text template
     */
    static generatePasswordResetTextTemplate(otp, userEmail) {
        return `
ActoFit - Password Reset Request

Hello,

We received a request to reset the password for your ActoFit account associated with ${userEmail}.

Your One-Time Password (OTP): ${otp}

This OTP is valid for 60 minutes only.

SECURITY NOTICE:
- Do not share this code with anyone
- If you didn't request this reset, please ignore this email
- This OTP will expire in 60 minutes for your security

If you have any questions or need assistance, please contact our support team.

---
© ${new Date().getFullYear()} ActoFit. All rights reserved.

If you didn't request this password reset, you can safely ignore this email.
Your password will remain unchanged.
        `.trim();
    }

    static createVerificationEmailTemplate(token) {
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

    // New method to create text template for verification email
    static createVerificationEmailTextTemplate(token) {
        return `
Sintracap - Email Verification Required

Hi there,

Thanks for signing up for Sintracap! To complete your registration, please use the verification token below:

VERIFICATION TOKEN: ${token}

IMPORTANT INFORMATION:
- This verification token will expire in 24 hours
- If you didn't create an account with Sintracap, you can safely ignore this email
- Enter this token in the verification form to activate your account

If you have any questions or need assistance, please contact our support team at support@sintracap.com

Best regards,
The Sintracap Team

---
© ${new Date().getFullYear()} Sintracap. All rights reserved.

This is an automated message. Please do not reply to this email.
    `.trim();
    }

}

module.exports = {
    EmailApiService
};