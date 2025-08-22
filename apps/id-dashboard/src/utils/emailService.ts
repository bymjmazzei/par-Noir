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
      // Handle initialization error silently
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
      // Handle error silently
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
      // Handle error silently
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
      // Handle error silently
    }
  }
}

// Initialize with environment variables
export const emailService = new EmailService();
