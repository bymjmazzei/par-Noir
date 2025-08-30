export interface NotificationEvent {
    id: string;
    type: 'recovery-request' | 'custodian-approval' | 'integration-update' | 'security-alert' | 'sync-complete' | 'device-pairing';
    timestamp: string;
    sender: string;
    encryptedPayload: string;
    signature: string;
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
    encryptedData: string;
    iv: string;
    salt: string;
    version: string;
    identityId: string;
    updatedAt: string;
}
export interface DataPointAccess {
    dataPointId: string;
    grantedTo: string[];
    grantedAt: string;
    expiresAt?: string;
    permissions: string[];
    lastUsed?: string;
}
export interface AttestedDataPoint {
    dataPointId: string;
    attestedAt: string;
    attestedBy: string;
    dataType: 'attested' | 'verified';
    userData: any;
    zkpToken: string;
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
        access: DataPointAccess[];
        proposals: DataPointProposal[];
        attestedData: AttestedDataPoint[];
        globalSettings: {
            [dataPointId: string]: {
                enabled: boolean;
                defaultPrivacy: 'public' | 'private' | 'selective';
                lastUpdated: string;
            };
        };
    };
}
export declare class SecureMetadataCrypto {
    /**
     * Encrypt metadata using ID file credentials
     */
    static encryptMetadata(metadata: MetadataContent, _username: string, passcode: string, identityId: string): Promise<SecureMetadata>;
    /**
     * Decrypt metadata using ID file credentials
     */
    static decryptMetadata(secureMetadata: SecureMetadata, _username: string, passcode: string): Promise<MetadataContent>;
    /**
     * Update specific fields in encrypted metadata
     */
    static updateMetadataField(secureMetadata: SecureMetadata, _username: string, passcode: string, field: keyof MetadataContent, value: any): Promise<SecureMetadata>;
    /**
     * Verify metadata integrity
     */
    static verifyMetadata(secureMetadata: SecureMetadata, _username: string, passcode: string): Promise<boolean>;
    /**
     * Create initial metadata for a new identity
     */
    static createInitialMetadata(_username: string, passcode: string, identityId: string, initialData?: Partial<MetadataContent>): Promise<SecureMetadata>;
}
