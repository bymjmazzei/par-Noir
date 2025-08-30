// Email service using SendGrid
import sgMail from '@sendgrid/mail';

export interface EmailConfig {
  apiKey: string;
  fromEmail: string;
  fromName: string;
}

export interface RecoveryEmailData {
  to: string;
  username: string;
  nickname: string;
  recoveryUrl: string;
  custodianName?: string;
}

export interface CustodianInvitationData {
  to: string;
  custodianName: string;
  identityName: string;
  invitationUrl: string;
}

export class EmailService {
  private config: EmailConfig;
  private isInitialized = false;

  constructor(config: EmailConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Set SendGrid API key
      sgMail.setApiKey(this.config.apiKey);
      
      if (process.env.NODE_ENV === 'development') {
      }
      
      this.isInitialized = true;
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
      }
      throw error;
    }
  }

  async sendRecoveryEmail(data: RecoveryEmailData): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const subject = 'Par-Noir Account Recovery';
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Par-Noir Account Recovery</h2>
          <p>Hello ${data.username},</p>
          <p>We received a request to recover your Par-Noir identity account.</p>
          <p><strong>Identity:</strong> ${data.nickname}</p>
          ${data.custodianName ? `<p><strong>Custodian:</strong> ${data.custodianName}</p>` : ''}
          <p>Click the button below to recover your account:</p>
          <a href="${data.recoveryUrl}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0;">
            Recover Account
          </a>
          <p>If you didn't request this recovery, please ignore this email.</p>
          <p>This link will expire in 24 hours for security.</p>
          <hr>
          <p style="color: #666; font-size: 12px;">
            Par-Noir Identity Protocol<br>
            Secure, decentralized identity management
          </p>
        </div>
      `;

      await sgMail.send({
        to: data.to,
        from: {
          email: this.config.fromEmail,
          name: this.config.fromName
        },
        subject: subject,
        html: html
      });

      if (process.env.NODE_ENV === 'development') {
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
      }
      throw error;
    }
  }

  async sendCustodianInvitation(data: CustodianInvitationData): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const subject = 'Par-Noir Custodian Invitation';
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Par-Noir Custodian Invitation</h2>
          <p>Hello ${data.custodianName},</p>
          <p>You have been invited to become a custodian for a Par-Noir identity.</p>
          <p><strong>Identity:</strong> ${data.identityName}</p>
          <p>As a custodian, you will be able to help recover this identity if needed.</p>
          <p>Click the button below to accept the invitation:</p>
          <a href="${data.invitationUrl}" style="background-color: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0;">
            Accept Invitation
          </a>
          <p>This invitation will expire in 7 days for security.</p>
          <hr>
          <p style="color: #666; font-size: 12px;">
            Par-Noir Identity Protocol<br>
            Secure, decentralized identity management
          </p>
        </div>
      `;

      await sgMail.send({
        to: data.to,
        from: {
          email: this.config.fromEmail,
          name: this.config.fromName
        },
        subject: subject,
        html: html
      });

      if (process.env.NODE_ENV === 'development') {
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
      }
      throw error;
    }
  }

  async sendSecurityAlert(data: {
    to: string;
    username: string;
    alertType: 'login' | 'recovery' | 'device' | 'custodian';
    details: string;
  }): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const alertMessages = {
        login: 'New Login Detected',
        recovery: 'Account Recovery Initiated',
        device: 'New Device Detected',
        custodian: 'Custodian Access'
      };

      const subject = `Par-Noir Security Alert: ${alertMessages[data.alertType]}`;
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #dc3545;">Par-Noir Security Alert</h2>
          <p>Hello ${data.username},</p>
          <p>We detected activity on your Par-Noir account that requires your attention.</p>
          <div style="background-color: #f8f9fa; padding: 15px; border-left: 4px solid #dc3545; margin: 20px 0;">
            <p><strong>Alert Type:</strong> ${alertMessages[data.alertType]}</p>
            <p><strong>Details:</strong> ${data.details}</p>
          </div>
          <p>If this activity was not initiated by you, please secure your account immediately.</p>
          <p style="color: #dc3545;"><strong>If you don't recognize this activity, change your password and review your security settings.</strong></p>
          <hr>
          <p style="color: #666; font-size: 12px;">
            Par-Noir Identity Protocol<br>
            Secure, decentralized identity management
          </p>
        </div>
      `;

      await sgMail.send({
        to: data.to,
        from: {
          email: this.config.fromEmail,
          name: this.config.fromName
        },
        subject: subject,
        html: html
      });

      if (process.env.NODE_ENV === 'development') {
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
      }
      throw error;
    }
  }

  async sendWelcomeEmail(data: {
    to: string;
    username: string;
    nickname: string;
  }): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const subject = 'Welcome to Par-Noir Identity Protocol';
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Welcome to Par-Noir!</h2>
          <p>Hello ${data.username},</p>
          <p>Welcome to Par-Noir Identity Protocol! Your decentralized identity has been successfully created.</p>
          <p><strong>Identity:</strong> ${data.nickname}</p>
          <p>Your identity is now secure and under your complete control. Here's what you can do:</p>
          <ul>
            <li>Manage your identity settings</li>
            <li>Set up recovery options</li>
            <li>Add custodians for backup</li>
            <li>Export your identity data</li>
          </ul>
          <p>If you have any questions, feel free to reach out to our support team.</p>
          <hr>
          <p style="color: #666; font-size: 12px;">
            Par-Noir Identity Protocol<br>
            Secure, decentralized identity management
          </p>
        </div>
      `;

      await sgMail.send({
        to: data.to,
        from: {
          email: this.config.fromEmail,
          name: this.config.fromName
        },
        subject: subject,
        html: html
      });

      if (process.env.NODE_ENV === 'development') {
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
      }
      throw error;
    }
  }

  getConfig(): EmailConfig {
    return { ...this.config };
  }

  async updateConfig(newConfig: Partial<EmailConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    
    // Reinitialize with new config
    this.isInitialized = false;
    await this.initialize();
  }
}

// Create email service instance with environment variables
export const emailService = new EmailService({
  apiKey: process.env.REACT_APP_SENDGRID_API_KEY || '',
  fromEmail: process.env.REACT_APP_FROM_EMAIL || 'noreply@parnoir.com',
  fromName: process.env.REACT_APP_FROM_NAME || 'Par-Noir Identity Protocol'
});
