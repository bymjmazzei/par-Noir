# Identity Protocol - Metadata Standards

## Overview

The Identity Protocol defines its own metadata standards for decentralized identity management, focusing on mobile-first, peer-to-peer communication with custodian-based recovery systems.

## Core Principles

- **Mobile-First**: Designed for mobile devices and QR code communication
- **Decentralized**: No central servers, peer-to-peer architecture
- **Recovery-Focused**: Built around custodian-based recovery systems
- **Privacy-Preserving**: Local storage with encrypted metadata
- **User-Owned**: Complete user control over identity data

## 1. Identity Document Standard

### Base Identity Document
```typescript
interface IdentityDocument {
  "@context": "https://identity-protocol.com/v1";
  "id": string; // Unique identity identifier
  "createdAt": string; // ISO 8601 timestamp
  "updatedAt": string; // ISO 8601 timestamp
  "status": "active" | "inactive" | "recovering";
  "metadata": IdentityMetadata;
  "custodians": RecoveryCustodian[];
  "recoveryConfig": RecoveryConfig;
  "deviceSync": DeviceSyncInfo;
  "qrCodeData": QRCodeMetadata;
  "deepLinkHandling": DeepLinkMetadata;
}
```

### Identity Metadata
```typescript
interface IdentityMetadata {
  "displayName"?: string;
  "username": string;
  "email"?: string;
  "phone"?: string;
  "nickname"?: string;
  "avatar"?: string; // Base64 encoded image
  "preferences": IdentityPreferences;
  "customFields"?: Record<string, any>;
}
```

### Identity Preferences
```typescript
interface IdentityPreferences {
  "privacy": "high" | "medium" | "low";
  "sharing": "open" | "selective" | "closed";
  "notifications": boolean;
  "backup": boolean;
  "recoveryThreshold": number; // 2-5 custodians required
  "maxCustodians": number; // Maximum 5 custodians
}
```

## 2. Custodian System Standards

### Recovery Custodian
```typescript
interface RecoveryCustodian {
  "id": string;
  "name": string;
  "type": "person" | "service" | "self";
  "status": "active" | "pending" | "inactive";
  "contactType": "email" | "phone";
  "contactValue": string;
  "publicKey": string; // Encrypted public key
  "metadata": CustodianMetadata;
  "addedAt": string; // ISO 8601 timestamp
  "lastVerified"?: string; // ISO 8601 timestamp
  "canApprove": boolean;
  "trustLevel": "high" | "medium" | "low";
}
```

### Custodian Metadata
```typescript
interface CustodianMetadata {
  "deviceId"?: string;
  "deviceName"?: string;
  "location"?: string;
  "lastSeen"?: string; // ISO 8601 timestamp
  "verificationMethod": "qr-code" | "deep-link" | "manual";
  "invitationExpiresAt"?: string; // ISO 8601 timestamp
}
```

### Recovery Configuration
```typescript
interface RecoveryConfig {
  "threshold": number; // Minimum custodians needed (2-5)
  "totalCustodians": number; // Total custodians (max 5)
  "recoveryKey": string; // Encrypted recovery key
  "createdAt": string; // ISO 8601 timestamp
  "updatedAt": string; // ISO 8601 timestamp
  "isReady": boolean; // True when threshold met
}
```

## 3. QR Code Communication Standards

### QR Code Data Structure
```typescript
interface QRCodeData {
  "type": "custodian-invitation" | "device-sync" | "recovery-request";
  "version": "1.0";
  "timestamp": string; // ISO 8601 timestamp
  "expiresAt": string; // ISO 8601 timestamp
  "data": CustodianInvitationData | DeviceSyncData | RecoveryRequestData;
  "signature"?: string; // Cryptographic signature
}
```

### Custodian Invitation Data
```typescript
interface CustodianInvitationData {
  "invitationId": string;
  "identityId": string;
  "identityName": string;
  "identityUsername": string;
  "custodianName": string;
  "custodianType": "person" | "service" | "self";
  "contactType": "email" | "phone";
  "contactValue": string;
  "deepLinkUrl": string; // URL to open app
  "qrCodeDataURL": string; // Base64 encoded QR image
}
```

### Device Sync Data
```typescript
interface DeviceSyncData {
  "deviceId": string;
  "deviceName": string;
  "deviceType": "mobile" | "desktop" | "tablet" | "other";
  "syncKey": string; // Encrypted device sync key
  "identityId": string;
  "deviceFingerprint": string; // Unique device identifier
  "expiresAt": string; // ISO 8601 timestamp
  "qrCodeDataURL": string; // Base64 encoded QR image
}
```

## 4. Recovery System Standards

### Recovery Request
```typescript
interface RecoveryRequest {
  "id": string;
  "requestingDid": string;
  "requestingUser": string;
  "timestamp": string; // ISO 8601 timestamp
  "status": "pending" | "approved" | "denied" | "expired";
  "approvals": string[]; // Array of custodian IDs
  "denials": string[]; // Array of custodian IDs
  "claimantContactType"?: "email" | "phone";
  "claimantContactValue"?: string;
  "expiresAt": string; // ISO 8601 timestamp
  "requiredApprovals": number;
  "currentApprovals": number;
}
```

### Recovery Key
```typescript
interface RecoveryKey {
  "id": string;
  "identityId": string;
  "keyData": string; // Encrypted key data
  "createdAt": string; // ISO 8601 timestamp
  "lastUsed"?: string; // ISO 8601 timestamp
  "purpose": "personal" | "legal" | "insurance" | "will";
  "description"?: string;
  "isActive": boolean;
  "assignedToCustodian"?: string; // Custodian ID
}
```

## 5. Device Management Standards

### Synced Device
```typescript
interface SyncedDevice {
  "id": string;
  "name": string;
  "type": "mobile" | "desktop" | "tablet" | "other";
  "lastSync": string; // ISO 8601 timestamp
  "status": "active" | "inactive";
  "location"?: string;
  "ipAddress"?: string;
  "isPrimary": boolean; // Marks the primary device
  "deviceFingerprint": string; // Unique device identifier
  "syncKey": string; // Encrypted key for device-to-device sync
  "pairedAt": string; // ISO 8601 timestamp
  "lastSeen": string; // ISO 8601 timestamp
}
```

### Device Sync Info
```typescript
interface DeviceSyncInfo {
  "identityId": string;
  "devices": SyncedDevice[];
  "syncSettings": DeviceSyncSettings;
  "lastSyncTimestamp": string; // ISO 8601 timestamp
}
```

### Device Sync Settings
```typescript
interface DeviceSyncSettings {
  "autoSync": boolean;
  "syncInterval": number; // minutes
  "encryptInTransit": boolean;
  "allowCrossDeviceAuth": boolean;
  "maxDevices": number; // Maximum synced devices
}
```

## 6. Deep Link Standards

### Deep Link Structure
```typescript
interface DeepLinkData {
  "protocol": "identity-protocol";
  "action": "custodian-invitation" | "device-sync" | "recovery-request";
  "data": CustodianInvitationData | DeviceSyncData | RecoveryRequestData;
  "signature"?: string; // Cryptographic signature
  "expiresAt": string; // ISO 8601 timestamp
}
```

### Deep Link URL Format
```
identity-protocol://action?data=<base64-encoded-data>&signature=<signature>&expires=<timestamp>
```

## 7. Privacy and Security Standards

### Privacy Sharing Settings
```typescript
interface PrivacySharingSettings {
  "identityId": string;
  "thirdParties": {
    [partyId: string]: ThirdPartyAccess;
  };
  "globalSettings": GlobalPrivacySettings;
}
```

### Third Party Access
```typescript
interface ThirdPartyAccess {
  "name": string;
  "permissions": string[];
  "dataShared": string[];
  "lastAccess": string; // ISO 8601 timestamp
  "expiresAt"?: string; // ISO 8601 timestamp
  "isActive": boolean;
}
```

### Global Privacy Settings
```typescript
interface GlobalPrivacySettings {
  "allowAnalytics": boolean;
  "allowMarketing": boolean;
  "allowThirdPartySharing": boolean;
  "dataRetentionDays": number;
  "encryptMetadata": boolean;
  "requireConsent": boolean;
}
```

## 8. Validation and Serialization

### Validation Functions
```typescript
// Validate identity document
const validateIdentityDocument = (doc: any): boolean => {
  return doc.id && 
         doc.createdAt && 
         doc.metadata && 
         doc.custodians && 
         doc.recoveryConfig;
};

// Validate custodian invitation
const validateCustodianInvitation = (invitation: any): boolean => {
  return invitation.invitationId && 
         invitation.identityId && 
         invitation.custodianName && 
         invitation.contactValue;
};

// Validate QR code data
const validateQRCodeData = (data: any): boolean => {
  return data.type && 
         data.timestamp && 
         data.expiresAt && 
         data.data;
};
```

### Serialization Functions
```typescript
// Serialize for IPFS storage
const serializeForIPFS = (data: any): string => {
  return JSON.stringify(data, null, 2);
};

// Deserialize from IPFS
const deserializeFromIPFS = (data: string): any => {
  return JSON.parse(data);
};

// Create IPFS CID
const createIPFSCID = async (data: any): Promise<string> => {
  const serialized = serializeForIPFS(data);
  // Implementation depends on IPFS client
  return "Qm..."; // Example CID
};
```

## 9. Version Control and Migration

### Version Management
```typescript
interface ProtocolVersion {
  "major": number;
  "minor": number;
  "patch": number;
  "deprecated": boolean;
  "migrationPath"?: string;
}
```

### Migration Functions
```typescript
// Migrate from v1.0 to v1.1
const migrateV1_0_to_V1_1 = (oldData: any): IdentityDocument => {
  // Migration logic
  return newData;
};

// Check if migration is needed
const needsMigration = (currentVersion: string, targetVersion: string): boolean => {
  // Version comparison logic
  return true;
};
```

## 10. Implementation Guidelines

### Best Practices
1. **Always validate** metadata before processing
2. **Use ISO 8601** timestamps for all dates
3. **Encrypt sensitive data** before IPFS storage
4. **Include signatures** for cryptographic verification
5. **Set expiration times** for all temporary data
6. **Version your metadata** for future compatibility
7. **Document all fields** for developer reference
8. **Test serialization** across different platforms

### Error Handling
```typescript
interface ValidationError {
  "field": string;
  "message": string;
  "code": string;
  "suggestion"?: string;
}

interface ProcessingError {
  "type": "validation" | "serialization" | "network" | "crypto";
  "message": string;
  "details"?: any;
  "recoverable": boolean;
}
```

## 11. Future Extensions

### Planned Features
- **Multi-signature support** for enhanced security
- **Time-locked recovery** for delayed access
- **Hierarchical custodians** for complex organizations
- **Cross-chain identity** for blockchain integration
- **Biometric integration** for enhanced authentication
- **Zero-knowledge proofs** for privacy-preserving verification

### Extension Points
```typescript
interface ExtensionPoint {
  "name": string;
  "version": string;
  "data": any;
  "signature": string;
}
```

This standard provides a comprehensive foundation for the Identity Protocol while maintaining flexibility for future enhancements and ensuring interoperability across different implementations. 