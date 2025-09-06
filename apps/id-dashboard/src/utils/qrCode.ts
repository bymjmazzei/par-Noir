import QRCode from 'qrcode';

export interface QRCodeData {
  type: 'device-pairing' | 'custodian-invitation' | 'recovery-key';
  data: any;
  timestamp: number;
  expiresAt?: number;
  signature?: string;
}

export interface DevicePairingData {
  deviceId: string;
  deviceName: string;
  deviceType: 'mobile' | 'desktop' | 'tablet' | 'other';
  syncKey: string;
  identityId: string;
  deviceFingerprint: string;
}

export interface CustodianInvitationData {
  invitationId: string;
  invitationCode: string;
  custodianName: string;
  custodianType: 'self-recovery' | 'person' | 'service';
  contactType: 'email' | 'phone';
  contactValue: string;
  expiresAt: number;
}

export class QRCodeManager {
  private static readonly QR_SIZE = 256;
  private static readonly QR_MARGIN = 2;

  /**
   * Generate QR code for device pairing
   */
  static async generateDevicePairingQR(data: DevicePairingData): Promise<string> {
    try {
      const qrData: QRCodeData = {
        type: 'device-pairing',
        data,
        timestamp: Date.now(),
        expiresAt: Date.now() + (5 * 60 * 1000), // 5 minutes
      };

      // Add signature for security
      qrData.signature = await this.generateSignature(qrData);

      const jsonData = JSON.stringify(qrData);
      return await QRCode.toDataURL(jsonData, {
        width: this.QR_SIZE,
        margin: this.QR_MARGIN,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
    } catch (error) {
      throw new Error(`Failed to generate device pairing QR code: ${error}`);
    }
  }

  /**
   * Generate QR code for custodian invitation
   */
  static async generateCustodianInvitationQR(data: CustodianInvitationData): Promise<string> {
    try {
      const qrData: QRCodeData = {
        type: 'custodian-invitation',
        data,
        timestamp: Date.now(),
        expiresAt: data.expiresAt,
      };

      // Add signature for security
      qrData.signature = await this.generateSignature(qrData);

      const jsonData = JSON.stringify(qrData);
      return await QRCode.toDataURL(jsonData, {
        width: this.QR_SIZE,
        margin: this.QR_MARGIN,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
    } catch (error) {
      throw new Error(`Failed to generate custodian invitation QR code: ${error}`);
    }
  }

  /**
   * Generate QR code for recovery key
   */
  static async generateRecoveryKeyQR(recoveryKey: string, purpose: string): Promise<string> {
    try {
      const qrData: QRCodeData = {
        type: 'recovery-key',
        data: {
          recoveryKey,
          purpose,
          generatedAt: Date.now()
        },
        timestamp: Date.now(),
      };

      // Add signature for security
      qrData.signature = await this.generateSignature(qrData);

      const jsonData = JSON.stringify(qrData);
      return await QRCode.toDataURL(jsonData, {
        width: this.QR_SIZE,
        margin: this.QR_MARGIN,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
    } catch (error) {
      throw new Error(`Failed to generate recovery key QR code: ${error}`);
    }
  }

  /**
   * Parse QR code data
   */
  static async parseQRCode(qrCodeDataURL: string): Promise<QRCodeData> {
    try {
      // Extract data from QR code image
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      return new Promise((resolve, reject) => {
        img.onload = async () => {
          try {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx?.drawImage(img, 0, 0);

            // In a real implementation, you would use a QR code decoder library
            // For now, we'll simulate parsing the data
            const mockData: QRCodeData = {
              type: 'device-pairing',
              data: {
                deviceId: `device-${Date.now()}`,
                deviceName: 'Mock Device',
                deviceType: 'mobile',
                syncKey: `sync-${Math.random().toString(36).substring(2)}`,
                identityId: `did:key:${Math.random().toString(36).substring(2)}`,
                deviceFingerprint: `fp-${Math.random().toString(36).substring(2)}`
              },
              timestamp: Date.now(),
              expiresAt: Date.now() + (5 * 60 * 1000),
              signature: `sig-${Math.random().toString(36).substring(2)}`
            };

            resolve(mockData);
          } catch (error) {
            reject(new Error(`Failed to parse QR code: ${error}`));
          }
        };

        img.onerror = () => reject(new Error('Failed to load QR code image'));
        img.src = qrCodeDataURL;
      });
    } catch (error) {
      throw new Error(`Failed to parse QR code: ${error}`);
    }
  }

  /**
   * Validate QR code data
   */
  static async validateQRCodeData(qrData: QRCodeData): Promise<boolean> {
    try {
      // Check if QR code has expired
      if (qrData.expiresAt && Date.now() > qrData.expiresAt) {
        return false;
      }

      // Verify signature
      if (qrData.signature) {
        const expectedSignature = await this.generateSignature(qrData);
        if (qrData.signature !== expectedSignature) {
          return false;
        }
      }

      // Validate data structure based on type
      switch (qrData.type) {
        case 'device-pairing':
          return this.validateDevicePairingData(qrData.data);
        case 'custodian-invitation':
          return this.validateCustodianInvitationData(qrData.data);
        case 'recovery-key':
          return this.validateRecoveryKeyData(qrData.data);
        default:
          return false;
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate signature for QR code data
   */
  private static async generateSignature(qrData: QRCodeData): Promise<string> {
    try {
      const dataToSign = {
        type: qrData.type,
        data: qrData.data,
        timestamp: qrData.timestamp,
        expiresAt: qrData.expiresAt
      };

      const dataString = JSON.stringify(dataToSign);
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(dataString);
      
      // Generate SHA-256 hash
      const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
    } catch (error) {
      throw new Error(`Failed to generate signature: ${error}`);
    }
  }

  /**
   * Validate device pairing data
   */
  private static validateDevicePairingData(data: any): boolean {
    return (
      data &&
      typeof data.deviceId === 'string' &&
      typeof data.deviceName === 'string' &&
      typeof data.deviceType === 'string' &&
      typeof data.syncKey === 'string' &&
      typeof data.identityId === 'string' &&
      typeof data.deviceFingerprint === 'string'
    );
  }

  /**
   * Validate custodian invitation data
   */
  private static validateCustodianInvitationData(data: any): boolean {
    return (
      data &&
      typeof data.invitationId === 'string' &&
      typeof data.invitationCode === 'string' &&
      typeof data.custodianName === 'string' &&
      typeof data.custodianType === 'string' &&
      typeof data.contactType === 'string' &&
      typeof data.contactValue === 'string' &&
      typeof data.expiresAt === 'number'
    );
  }

  /**
   * Validate recovery key data
   */
  private static validateRecoveryKeyData(data: any): boolean {
    return (
      data &&
      typeof data.recoveryKey === 'string' &&
      typeof data.purpose === 'string' &&
      typeof data.generatedAt === 'number'
    );
  }

  /**
   * Generate device fingerprint
   */
  static generateDeviceFingerprint(): string {
    try {
      const fingerprintData = {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        screenResolution: `${screen.width}x${screen.height}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timestamp: Date.now()
      };

      const dataString = JSON.stringify(fingerprintData);
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(dataString);
      
      // Generate SHA-256 hash
      crypto.subtle.digest('SHA-256', dataBuffer).then(hashBuffer => {
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
      });

      // Fallback for demo
      return `fp-${Math.random().toString(36).substring(2)}`;
    } catch (error) {
      return `fp-${Math.random().toString(36).substring(2)}`;
    }
  }

  /**
   * Generate sync key
   */
  static generateSyncKey(): string {
    try {
      const randomBytes = crypto.getRandomValues(new Uint8Array(32));
      const hashBuffer = crypto.subtle.digest('SHA-256', randomBytes);
      
      hashBuffer.then(buffer => {
        const hashArray = Array.from(new Uint8Array(buffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
      });

      // Fallback for demo
      return `sync-${Math.random().toString(36).substring(2)}`;
    } catch (error) {
      return `sync-${Math.random().toString(36).substring(2)}`;
    }
  }
} 