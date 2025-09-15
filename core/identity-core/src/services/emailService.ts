// import { cryptoWorkerManager } from './encryption/cryptoWorkerManager';
/**
 * SendGrid Email Service Integration
 * Provi email functionality for recovery and notifications
 */

import { SecureRandom } from '../utils/secureRandom';

export interface SendGridConfig {
  apiKey: string;
  fromEmail: string;
  fromName: string;
  enabled: boolean;
  sandboxMode: boolean;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  htmlContent: string;
  textContent: string;
}

export interface EmailRequest {
  to: string | string[];
  templateId?: string;
  subject?: string;
  htmlContent?: string;
  textContent?: string;
  dynamicTemplateData?: any;
  attachments?: EmailAttachment[];
  categories?: string[];
}

export interface EmailAttachment {
  content: string; // Base64 encoded
  filename: string;
  type: string;
  disposition?: 'attachment' | 'inline';
}

export interface EmailResponse {
  success: boolean;
  messageId?: string;
  error?: string;
  statusCode?: number;
}

export interface EmailStats {
  sent: number;
  delivered: number;
  bounced: number;
  opened: number;
  clicked: number;
  unsubscribed: number;
}

export class SendGridService {
  private config: SendGridConfig;
  private isInitialized = false;
  private templates: Map<string, EmailTemplate> = new Map();

  constructor(config: SendGridConfig) {
    this.config = config;
    this.initializeTemplates();
  }

  /**
   * Initialize SendGrid connection
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      // SendGrid is disabled
      return;
    }

    try {
      // In production, this would use the SendGrid SDK
      // For now, we'll simulate the connection
      await this.simulateSendGridConnection();
      
      this.isInitialized = true;
      // Console statement removed for production
    } catch (error) {
      throw new Error(`Failed to initialize SendGrid: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Simulate SendGrid connection for development/testing
   */
  private async simulateSendGridConnection(): Promise<void> {
    // Simulate connection delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Simulate connection test
    const success = SecureRandom.generateSuccess(0.9); // 90% success rate
    
    if (!success) {
      throw new Error('Failed to connect to SendGrid');
    }
  }

  /**
   * Initialize email templates
   */
  private initializeTemplates(): void {
    // Recovery email template
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

    // Email verification template
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

    // Security alert template
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

  /**
   * Send email
   */
  async sendEmail(request: EmailRequest): Promise<EmailResponse> {
    if (!this.isInitialized) {
      throw new Error('SendGrid not initialized');
    }

    try {
      // Validate request
      this.validateEmailRequest(request);

      // In production, this would use SendGrid API
      const messageId = this.generateMessageId();
      
      // Simulate email sending
      await this.simulateEmailSending(request);

      return {
        success: true,
        messageId,
        statusCode: 202
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        statusCode: 500
      };
    }
  }

  /**
   * Send email using template
   */
  async sendTemplateEmail(
    to: string | string[],
    templateId: string,
    dynamicTemplateData: any
  ): Promise<EmailResponse> {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    const request: EmailRequest = {
      to,
      subject: template.subject,
      htmlContent: this.replaceTemplateVariables(template.htmlContent, dynamicTemplateData),
      textContent: this.replaceTemplateVariables(template.textContent, dynamicTemplateData),
      dynamicTemplateData
    };

    return this.sendEmail(request);
  }

  /**
   * Send recovery email
   */
  async sendRecoveryEmail(
    to: string,
    name: string,
    recoveryUrl: string,
    expiryTime: string
  ): Promise<EmailResponse> {
    return this.sendTemplateEmail(to, 'recovery', {
      name,
      recoveryUrl,
      expiryTime
    });
  }

  /**
   * Send verification email
   */
  async sendVerificationEmail(
    to: string,
    name: string,
    verificationUrl: string,
    expiryTime: string
  ): Promise<EmailResponse> {
    return this.sendTemplateEmail(to, 'verification', {
      name,
      verificationUrl,
      expiryTime
    });
  }

  /**
   * Send security alert
   */
  async sendSecurityAlert(
    to: string,
    name: string,
    activity: string,
    timestamp: string,
    location: string,
    device: string,
    securityUrl: string
  ): Promise<EmailResponse> {
    return this.sendTemplateEmail(to, 'security_alert', {
      name,
      activity,
      timestamp,
      location,
      device,
      securityUrl
    });
  }

  /**
   * Get email statistics
   */
  async getEmailStats(startDate: string, endDate: string): Promise<EmailStats> {
    if (!this.isInitialized) {
      throw new Error('SendGrid not initialized');
    }

    // In production, this would fetch from SendGrid API
    return {
      sent: SecureRandom.generateStatistic(0, 999),
      delivered: SecureRandom.generateStatistic(0, 949),
      bounced: SecureRandom.generateStatistic(0, 49),
      opened: SecureRandom.generateStatistic(0, 799),
      clicked: SecureRandom.generateStatistic(0, 199),
      unsubscribed: SecureRandom.generateStatistic(0, 9)
    };
  }

  /**
   * Validate email request
   */
  private validateEmailRequest(request: EmailRequest): void {
    if (!request.to || (Array.isArray(request.to) && request.to.length === 0)) {
      throw new Error('Recipient email is required');
    }

    if (!request.templateId && !request.subject) {
      throw new Error('Either templateId or subject is required');
    }

    if (!request.templateId && !request.htmlContent && !request.textContent) {
      throw new Error('Email content is required');
    }

    // Validate email format
    const emails = Array.isArray(request.to) ? request.to : [request.to];
    for (const email of emails) {
      if (!this.isValidEmail(email)) {
        throw new Error(`Invalid email format: ${email}`);
      }
    }
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Replace template variables
   */
  private replaceTemplateVariables(content: string, data: any): string {
    let result = content;
    for (const [key, value] of Object.entries(data)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, String(value));
    }
    return result;
  }

  /**
   * Simulate email sending
   */
  private async simulateEmailSending(request: EmailRequest): Promise<void> {
    // Simulate sending delay
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Simulate success/failure
    const success = SecureRandom.generateSuccess(0.95); // 95% success rate
    
    if (!success) {
      throw new Error('Failed to send email');
    }
  }

  /**
   * Generate message ID
   */
  private generateMessageId(): string {
    return SecureRandom.generateMessageId();
  }

  /**
   * Get template by ID
   */
  getTemplate(templateId: string): EmailTemplate | undefined {
    return this.templates.get(templateId);
  }

  /**
   * List all templates
   */
  listTemplates(): EmailTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Add custom template
   */
  addTemplate(template: EmailTemplate): void {
    this.templates.set(template.id, template);
  }

  /**
   * Remove template
   */
  removeTemplate(templateId: string): boolean {
    return this.templates.delete(templateId);
  }

  /**
   * Check if SendGrid is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Get configuration
   */
  getConfig(): SendGridConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  async updateConfig(newConfig: Partial<SendGridConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    
    // Reinitialize if enabled status changed
    if (newConfig.enabled !== undefined && newConfig.enabled !== this.config.enabled) {
      await this.initialize();
    }
  }
}

// Export singleton instance
export const emailService = new SendGridService({
  apiKey: process.env.SENDGRID_API_KEY || '',
  fromEmail: process.env.SENDGRID_FROM_EMAIL || 'noreply@your-domain.com',
  fromName: process.env.SENDGRID_FROM_NAME || 'Identity Protocol',
  enabled: process.env.SENDGRID_ENABLED === 'true',
  sandboxMode: process.env.NODE_ENV === 'development'
});
