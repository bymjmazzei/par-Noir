// Email service using SendGrid
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
  // private config: EmailConfig;
  private isInitialized = false;

  // constructor(config: EmailConfig) {
  //   // this.config = config;
  // }

  async initialize(config?: EmailConfig): Promise<void> {
    try {
      if (config) {
        // this.config = config;
      }
      this.isInitialized = true;
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to initialize email service:', error);
      }
    }
  }

  async sendRecoveryEmail(_data: RecoveryEmailData): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize({
        apiKey: process.env.REACT_APP_SENDGRID_API_KEY || 'your-sendgrid-api-key',
        fromEmail: process.env.REACT_APP_FROM_EMAIL || 'noreply@identityprotocol.com',
        fromName: process.env.REACT_APP_FROM_NAME || 'Identity Protocol'
      });
    }

    try {
      // In production, this would send via SendGrid
      
      // Simulate email sending
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to send recovery email:', error);
      }
    }
  }

  async sendCustodianInvitation(_data: CustodianInvitationData): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize({
        apiKey: process.env.REACT_APP_SENDGRID_API_KEY || 'your-sendgrid-api-key',
        fromEmail: process.env.REACT_APP_FROM_EMAIL || 'noreply@identityprotocol.com',
        fromName: process.env.REACT_APP_FROM_NAME || 'Identity Protocol'
      });
    }

    try {
      // In production, this would send via SendGrid
      
      // Simulate email sending
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to send custodian invitation:', error);
      }
    }
  }

  async sendSecurityAlert(_data: {
    to: string;
    username: string;
    alertType: 'login' | 'recovery' | 'device' | 'custodian';
    details: string;
  }): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize({
        apiKey: process.env.REACT_APP_SENDGRID_API_KEY || 'your-sendgrid-api-key',
        fromEmail: process.env.REACT_APP_FROM_EMAIL || 'noreply@identityprotocol.com',
        fromName: process.env.REACT_APP_FROM_NAME || 'Identity Protocol'
      });
    }

    try {
      // Simulate email sending
      await new Promise(resolve => setTimeout(resolve, 800));
      
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to send security alert:', error);
      }
    }
  }
}

// Initialize with environment variables
export const emailService = new EmailService();
