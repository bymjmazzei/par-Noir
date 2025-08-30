import { IdentityCrypto } from './crypto';

export interface NotificationEvent {
  id: string;
  type: 'recovery-request' | 'custodian-approval' | 'integration-update' | 'security-alert' | 'sync-complete' | 'device-pairing' | 'data-request' | 'system-update';
  timestamp: string;
  sender: string; // Who sent the notification (pN ID)
  encryptedPayload: string; // Encrypted notification data
  signature: string; // Cryptographic signature
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface NotificationSettings {
  enabled: boolean;
  recoveryRequests: boolean;
  custodianApprovals: boolean;
  integrationUpdates: boolean;
  securityAlerts: boolean;
  syncNotifications: boolean;
  devicePairing: boolean;
  sound: boolean;
  vibration: boolean;
  showInApp: boolean;
  showSystem: boolean;
}

export interface SecureMetadata {
  // Encrypted with ID file credentials
  encryptedData: string; // Base64 encoded encrypted JSON
  iv: string; // Initialization vector
  salt: string; // Salt for key derivation
  version: string;
  identityId: string; // Reference to the ID file
  updatedAt: string;
  notifications?: {
    unread: NotificationEvent[];
    read: NotificationEvent[];
    lastChecked: string;
    settings: NotificationSettings;
  };
  dataPoints?: {
    access: DataPointAccess[]; // Which data points this pN has granted access to
    proposals: DataPointProposal[]; // Proposals submitted by this pN
    attestedData: AttestedDataPoint[]; // Data points attested by this pN
    globalSettings: {
      [dataPointId: string]: {
        enabled: boolean;
        defaultPrivacy: 'public' | 'private' | 'selective';
        lastUpdated: string;
      };
    };
  };
}

export interface DataPointAccess {
  dataPointId: string;
  grantedTo: string[]; // Array of platform/tool IDs
  grantedAt: string;
  expiresAt?: string;
  permissions: string[]; // What the platform can do with this data point
  lastUsed?: string;
}

export interface AttestedDataPoint {
  dataPointId: string;
  attestedAt: string;
  attestedBy: string; // pN ID of the user who attested
  dataType: 'attested' | 'verified'; // attested = user claims, verified = notary verified
  userData: any; // The actual data provided by user
  zkpToken: string; // Generated ZKP proof token
  expiresAt?: string;
  lastUsed?: string;
}

export interface DataPointProposal {
  id: string;
  name: string;
  description: string;
  category: 'verification' | 'preferences' | 'compliance' | 'location';
  dataType: 'string' | 'number' | 'boolean' | 'date' | 'object';
  requiredFields: string[];
  optionalFields?: string[];
  examples: string[];
  useCase: string;
  proposedBy: string;
  proposedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  votes: {
    upvotes: number;
    downvotes: number;
    voters: string[];
  };
}

export interface MetadataContent {
  nickname?: string;
  profilePicture?: string;
  custodians?: any[];
  recoveryKeys?: any[];
  syncedDevices?: any[];
  privacySettings?: any;
  notifications?: {
    unread: NotificationEvent[];
    read: NotificationEvent[];
    lastChecked: string;
    settings: NotificationSettings;
  };
                dataPoints?: {
                access: DataPointAccess[]; // Which data points this pN has granted access to
                proposals: DataPointProposal[]; // Proposals submitted by this pN
                attestedData: AttestedDataPoint[]; // Data points attested by this pN
                globalSettings: {
                  [dataPointId: string]: {
                    enabled: boolean;
                    defaultPrivacy: 'public' | 'private' | 'selective';
                    lastUpdated: string;
                  };
                };
              };
}

export class SecureMetadataCrypto {
  /**
   * Encrypt metadata using ID file credentials
   */
  static async encryptMetadata(
    metadata: MetadataContent,
    _username: string,
    passcode: string,
    identityId: string
  ): Promise<SecureMetadata> {
    try {
      // Convert metadata to JSON string
      const metadataString = JSON.stringify(metadata);
      
      // Use the same encryption as ID file
      const encryptedData = await IdentityCrypto.encryptData(metadataString, passcode);
      
      return {
        encryptedData: encryptedData.encrypted,
        iv: encryptedData.iv,
        salt: encryptedData.salt,
        version: '1.0.0',
        identityId,
        updatedAt: new Date().toISOString()
      };
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
      }
      throw new Error('Metadata encryption failed');
    }
  }

  /**
   * Decrypt metadata using ID file credentials
   */
  static async decryptMetadata(
    secureMetadata: SecureMetadata,
    _username: string,
    passcode: string
  ): Promise<MetadataContent> {
    try {
      // Use the same decryption as ID file
      const encryptedData = {
        encrypted: secureMetadata.encryptedData,
        iv: secureMetadata.iv,
        salt: secureMetadata.salt
      };
      
      const decryptedString = await IdentityCrypto.decryptData(encryptedData, passcode);
      return JSON.parse(decryptedString);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
      }
      throw new Error('Metadata decryption failed - check your credentials');
    }
  }

  /**
   * Update specific fields in encrypted metadata
   */
  static async updateMetadataField(
    secureMetadata: SecureMetadata,
    _username: string,
    passcode: string,
    field: keyof MetadataContent,
    value: any
  ): Promise<SecureMetadata> {
    try {
      // Decrypt current metadata
      const currentMetadata = await this.decryptMetadata(
        secureMetadata,
        _username,
        passcode
      );
      
      // Update the specific field
      const updatedMetadata: MetadataContent = {
        ...currentMetadata,
        [field]: value
      };
      
      // Re-encrypt the updated metadata
      return await this.encryptMetadata(
        updatedMetadata,
        _username,
        passcode,
        secureMetadata.identityId
      );
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
      }
      throw new Error('Metadata update failed');
    }
  }

  /**
   * Verify metadata integrity
   */
  static async verifyMetadata(
    secureMetadata: SecureMetadata,
    _username: string,
    passcode: string
  ): Promise<boolean> {
    try {
      await this.decryptMetadata(secureMetadata, _username, passcode);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Create initial metadata for a new identity
   */
  static async createInitialMetadata(
    _username: string,
    passcode: string,
    identityId: string,
    initialData: Partial<MetadataContent> = {}
  ): Promise<SecureMetadata> {
    const initialMetadata: MetadataContent = {
      nickname: initialData.nickname || _username,
      profilePicture: initialData.profilePicture,
      custodians: initialData.custodians || [],
      recoveryKeys: initialData.recoveryKeys || [],
      syncedDevices: initialData.syncedDevices || [],
      privacySettings: initialData.privacySettings || {}
    };

    return await this.encryptMetadata(initialMetadata, _username, passcode, identityId);
  }
}
