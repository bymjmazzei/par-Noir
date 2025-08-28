// SMS service using Twilio
import twilio from 'twilio';

export interface SMSConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

export interface RecoverySMSData {
  to: string;
  message: string;
  recoveryCode?: string;
}

export interface SecuritySMSData {
  to: string;
  username: string;
  alertType: 'login' | 'recovery' | 'device' | 'custodian';
  details: string;
}

export class SMSService {
  private config: SMSConfig;
  private client: twilio.Twilio | null = null;
  private isInitialized = false;

  constructor(config: SMSConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Initialize Twilio client
      this.client = twilio(this.config.accountSid, this.config.authToken);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('✅ Twilio SMS service initialized');
      }
      
      this.isInitialized = true;
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('❌ Failed to initialize Twilio SMS service:', error);
      }
      throw error;
    }
  }

  async sendRecoverySMS(data: RecoverySMSData): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.client) {
      throw new Error('Twilio client not initialized');
    }

    try {
      const message = data.recoveryCode 
        ? `Your Par-Noir recovery code is: ${data.recoveryCode}. Use this code to recover your account.`
        : data.message;

      await this.client.messages.create({
        body: message,
        from: this.config.fromNumber,
        to: data.to
      });

      if (process.env.NODE_ENV === 'development') {
        console.log(`✅ Recovery SMS sent to ${data.to}`);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('❌ Failed to send recovery SMS:', error);
      }
      throw error;
    }
  }

  async sendSecuritySMS(data: SecuritySMSData): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.client) {
      throw new Error('Twilio client not initialized');
    }

    try {
      const alertMessages = {
        login: `Security Alert: New login detected for ${data.username}`,
        recovery: `Security Alert: Account recovery initiated for ${data.username}`,
        device: `Security Alert: New device detected for ${data.username}`,
        custodian: `Security Alert: Custodian access for ${data.username}`
      };

      const message = `${alertMessages[data.alertType]}\n\nDetails: ${data.details}\n\nIf this wasn't you, please secure your account immediately.`;

      await this.client.messages.create({
        body: message,
        from: this.config.fromNumber,
        to: data.to
      });

      if (process.env.NODE_ENV === 'development') {
        console.log(`✅ Security SMS sent to ${data.to}`);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('❌ Failed to send security SMS:', error);
      }
      throw error;
    }
  }

  async sendVerificationSMS(to: string, code: string): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.client) {
      throw new Error('Twilio client not initialized');
    }

    try {
      const message = `Your Par-Noir verification code is: ${code}. Enter this code to verify your phone number.`;

      await this.client.messages.create({
        body: message,
        from: this.config.fromNumber,
        to: to
      });

      if (process.env.NODE_ENV === 'development') {
        console.log(`✅ Verification SMS sent to ${to}`);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('❌ Failed to send verification SMS:', error);
      }
      throw error;
    }
  }

  async validatePhoneNumber(phoneNumber: string): Promise<boolean> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.client) {
      throw new Error('Twilio client not initialized');
    }

    try {
      // Use Twilio's Lookup API to validate phone numbers
      const lookup = await this.client.lookups.v2.phoneNumbers(phoneNumber).fetch();
      return lookup.valid;
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('❌ Phone number validation failed:', error);
      }
      return false;
    }
  }

  getConfig(): SMSConfig {
    return { ...this.config };
  }

  async updateConfig(newConfig: Partial<SMSConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    
    // Reinitialize with new config
    this.isInitialized = false;
    this.client = null;
    await this.initialize();
  }
}

// Create SMS service instance with environment variables
export const smsService = new SMSService({
  accountSid: process.env.REACT_APP_TWILIO_ACCOUNT_SID || '',
  authToken: process.env.REACT_APP_TWILIO_AUTH_TOKEN || '',
  fromNumber: process.env.REACT_APP_TWILIO_FROM_NUMBER || ''
});
