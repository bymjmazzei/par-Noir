"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailService = exports.SendGridService = void 0;
class SendGridService {
    constructor(config) {
        this.isInitialized = false;
        this.templates = new Map();
        this.config = config;
        this.initializeTemplates();
    }
    async initialize() {
        if (!this.config.enabled) {
            console.log('SendGrid is disabled');
            return;
        }
        try {
            await this.simulateSendGridConnection();
            this.isInitialized = true;
            console.log('SendGrid initialized successfully');
        }
        catch (error) {
            throw new Error(`Failed to initialize SendGrid: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async simulateSendGridConnection() {
        await new Promise(resolve => setTimeout(resolve, 100));
        const success = Math.random() > 0.1;
        if (!success) {
            throw new Error('Failed to connect to SendGrid');
        }
    }
    initializeTemplates() {
        this.templates.set('recovery', {
            id: 'recovery',
            name: 'Account Recovery',
            subject: 'Identity Protocol - Account Recovery Request',
            htmlContent: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Account Recovery</title>
        </head>
        <body>
          <h2>Account Recovery Request</h2>
          <p>Hello {{name}},</p>
          <p>We received a request to recover your Identity Protocol account.</p>
          <p>If you initiated this request, please click the link below to proceed:</p>
          <a href="{{recoveryUrl}}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Recover Account</a>
          <p>This link will expire in {{expiryTime}}.</p>
          <p>If you did not request this recovery, please ignore this email.</p>
          <p>Best regards,<br>Identity Protocol Team</p>
        </body>
        </html>
      `,
            textContent: `
        Account Recovery Request
        
        Hello {{name}},
        
        We received a request to recover your Identity Protocol account.
        
        If you initiated this request, please visit the following link to proceed:
        {{recoveryUrl}}
        
        This link will expire in {{expiryTime}}.
        
        If you did not request this recovery, please ignore this email.
        
        Best regards,
        Identity Protocol Team
      `
        });
        this.templates.set('verification', {
            id: 'verification',
            name: 'Email Verification',
            subject: 'Identity Protocol - Verify Your Email',
            htmlContent: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Email Verification</title>
        </head>
        <body>
          <h2>Verify Your Email Address</h2>
          <p>Hello {{name}},</p>
          <p>Please verify your email address by clicking the link below:</p>
          <a href="{{verificationUrl}}" style="background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Verify Email</a>
          <p>This link will expire in {{expiryTime}}.</p>
          <p>If you did not create an account, please ignore this email.</p>
          <p>Best regards,<br>Identity Protocol Team</p>
        </body>
        </html>
      `,
            textContent: `
        Email Verification
        
        Hello {{name}},
        
        Please verify your email address by visiting the following link:
        {{verificationUrl}}
        
        This link will expire in {{expiryTime}}.
        
        If you did not create an account, please ignore this email.
        
        Best regards,
        Identity Protocol Team
      `
        });
        this.templates.set('security_alert', {
            id: 'security_alert',
            name: 'Security Alert',
            subject: 'Identity Protocol - Security Alert',
            htmlContent: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Security Alert</title>
        </head>
        <body>
          <h2>Security Alert</h2>
          <p>Hello {{name}},</p>
          <p>We detected suspicious activity on your Identity Protocol account:</p>
          <ul>
            <li>Activity: {{activity}}</li>
            <li>Time: {{timestamp}}</li>
            <li>Location: {{location}}</li>
            <li>Device: {{device}}</li>
          </ul>
          <p>If this was you, no action is required. If not, please secure your account immediately.</p>
          <a href="{{securityUrl}}" style="background-color: #dc3545; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Secure Account</a>
          <p>Best regards,<br>Identity Protocol Security Team</p>
        </body>
        </html>
      `,
            textContent: `
        Security Alert
        
        Hello {{name}},
        
        We detected suspicious activity on your Identity Protocol account:
        
        Activity: {{activity}}
        Time: {{timestamp}}
        Location: {{location}}
        Device: {{device}}
        
        If this was you, no action is required. If not, please secure your account immediately.
        
        Visit: {{securityUrl}}
        
        Best regards,
        Identity Protocol Security Team
      `
        });
    }
    async sendEmail(request) {
        if (!this.isInitialized) {
            throw new Error('SendGrid not initialized');
        }
        try {
            this.validateEmailRequest(request);
            const messageId = this.generateMessageId();
            await this.simulateEmailSending(request);
            return {
                success: true,
                messageId,
                statusCode: 202
            };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                statusCode: 500
            };
        }
    }
    async sendTemplateEmail(to, templateId, dynamicTemplateData) {
        const template = this.templates.get(templateId);
        if (!template) {
            throw new Error(`Template ${templateId} not found`);
        }
        const request = {
            to,
            subject: template.subject,
            htmlContent: this.replaceTemplateVariables(template.htmlContent, dynamicTemplateData),
            textContent: this.replaceTemplateVariables(template.textContent, dynamicTemplateData),
            dynamicTemplateData
        };
        return this.sendEmail(request);
    }
    async sendRecoveryEmail(to, name, recoveryUrl, expiryTime) {
        return this.sendTemplateEmail(to, 'recovery', {
            name,
            recoveryUrl,
            expiryTime
        });
    }
    async sendVerificationEmail(to, name, verificationUrl, expiryTime) {
        return this.sendTemplateEmail(to, 'verification', {
            name,
            verificationUrl,
            expiryTime
        });
    }
    async sendSecurityAlert(to, name, activity, timestamp, location, device, securityUrl) {
        return this.sendTemplateEmail(to, 'security_alert', {
            name,
            activity,
            timestamp,
            location,
            device,
            securityUrl
        });
    }
    async getEmailStats(startDate, endDate) {
        if (!this.isInitialized) {
            throw new Error('SendGrid not initialized');
        }
        return {
            sent: Math.floor(Math.random() * 1000),
            delivered: Math.floor(Math.random() * 950),
            bounced: Math.floor(Math.random() * 50),
            opened: Math.floor(Math.random() * 800),
            clicked: Math.floor(Math.random() * 200),
            unsubscribed: Math.floor(Math.random() * 10)
        };
    }
    validateEmailRequest(request) {
        if (!request.to || (Array.isArray(request.to) && request.to.length === 0)) {
            throw new Error('Recipient email is required');
        }
        if (!request.templateId && !request.subject) {
            throw new Error('Either templateId or subject is required');
        }
        if (!request.templateId && !request.htmlContent && !request.textContent) {
            throw new Error('Email content is required');
        }
        const emails = Array.isArray(request.to) ? request.to : [request.to];
        for (const email of emails) {
            if (!this.isValidEmail(email)) {
                throw new Error(`Invalid email format: ${email}`);
            }
        }
    }
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
    replaceTemplateVariables(content, data) {
        let result = content;
        for (const [key, value] of Object.entries(data)) {
            const regex = new RegExp(`{{${key}}}`, 'g');
            result = result.replace(regex, String(value));
        }
        return result;
    }
    async simulateEmailSending(request) {
        await new Promise(resolve => setTimeout(resolve, 200));
        const success = Math.random() > 0.05;
        if (!success) {
            throw new Error('Failed to send email');
        }
    }
    generateMessageId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    getTemplate(templateId) {
        return this.templates.get(templateId);
    }
    listTemplates() {
        return Array.from(this.templates.values());
    }
    addTemplate(template) {
        this.templates.set(template.id, template);
    }
    removeTemplate(templateId) {
        return this.templates.delete(templateId);
    }
    isReady() {
        return this.isInitialized;
    }
    getConfig() {
        return { ...this.config };
    }
    async updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        if (newConfig.enabled !== undefined && newConfig.enabled !== this.config.enabled) {
            await this.initialize();
        }
    }
}
exports.SendGridService = SendGridService;
exports.emailService = new SendGridService({
    apiKey: process.env.SENDGRID_API_KEY || '',
    fromEmail: process.env.SENDGRID_FROM_EMAIL || 'noreply@your-domain.com',
    fromName: process.env.SENDGRID_FROM_NAME || 'Identity Protocol',
    enabled: process.env.SENDGRID_ENABLED === 'true',
    sandboxMode: process.env.NODE_ENV === 'development'
});
//# sourceMappingURL=emailService.js.map