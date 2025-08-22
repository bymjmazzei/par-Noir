# Identity Protocol - Quick Reference Guide

## 🚀 **Quick Start**

### **Import Standards**
```typescript
import {
  IdentityDocument,
  RecoveryCustodian,
  QRCodeData,
  RecoveryRequest,
  validateIdentityDocument,
  generateTimestamp,
  generateUniqueId,
  PROTOCOL_VERSION
} from '../types/metadata-standards';
```

### **Create Identity**
```typescript
const identity: IdentityDocument = {
  "@context": "https://identity-protocol.com/v1",
  id: generateUniqueId(),
  createdAt: generateTimestamp(),
  updatedAt: generateTimestamp(),
  status: "active",
  metadata: {
    username: "john_doe",
    displayName: "John Doe",
    email: "john@example.com",
    preferences: {
      privacy: "high",
      sharing: "selective",
      notifications: true,
      backup: true,
      recoveryThreshold: 2,
      maxCustodians: 5
    }
  },
  custodians: [],
  recoveryConfig: {
    threshold: 2,
    totalCustodians: 0,
    recoveryKey: "",
    createdAt: generateTimestamp(),
    updatedAt: generateTimestamp(),
    isReady: false
  },
  deviceSync: {
    identityId: generateUniqueId(),
    devices: [],
    syncSettings: {
      autoSync: true,
      syncInterval: 30,
      encryptInTransit: true,
      allowCrossDeviceAuth: true,
      maxDevices: 5
    },
    lastSyncTimestamp: generateTimestamp()
  },
  qrCodeData: {
    lastGenerated: generateTimestamp(),
    activeCodes: []
  },
  deepLinkHandling: {
    supportedActions: ["custodian-invitation", "device-sync"],
    lastProcessed: generateTimestamp()
  }
};
```

## 📋 **Core Interfaces**

### **Identity Document**
```typescript
interface IdentityDocument {
  "@context": "https://identity-protocol.com/v1";
  id: string;
  createdAt: string;
  updatedAt: string;
  status: "active" | "inactive" | "recovering";
  metadata: IdentityMetadata;
  custodians: RecoveryCustodian[];
  recoveryConfig: RecoveryConfig;
  deviceSync: DeviceSyncInfo;
  qrCodeData: QRCodeMetadata;
  deepLinkHandling: DeepLinkMetadata;
}
```

### **Recovery Custodian**
```typescript
interface RecoveryCustodian {
  id: string;
  name: string;
  type: "person" | "service" | "self";
  status: "active" | "pending" | "inactive";
  contactType: "email" | "phone";
  contactValue: string;
  publicKey: string;
  metadata: CustodianMetadata;
  addedAt: string;
  lastVerified?: string;
  canApprove: boolean;
  trustLevel: "high" | "medium" | "low";
}
```

### **QR Code Data**
```typescript
interface QRCodeData {
  type: "custodian-invitation" | "device-sync" | "recovery-request";
  version: "1.0";
  timestamp: string;
  expiresAt: string;
  data: CustodianInvitationData | DeviceSyncData | RecoveryRequestData;
  signature?: string;
}
```

### **Recovery Request**
```typescript
interface RecoveryRequest {
  id: string;
  requestingDid: string;
  requestingUser: string;
  timestamp: string;
  status: "pending" | "approved" | "denied" | "expired";
  approvals: string[];
  denials: string[];
  claimantContactType?: "email" | "phone";
  claimantContactValue?: string;
  expiresAt: string;
  requiredApprovals: number;
  currentApprovals: number;
}
```

## 🔧 **Utility Functions**

### **Validation**
```typescript
// Validate identity document
const isValid = validateIdentityDocument(identity);

// Validate custodian invitation
const isValidInvitation = validateCustodianInvitation(invitation);

// Validate QR code data
const isValidQR = validateQRCodeData(qrData);
```

### **Generation**
```typescript
// Generate timestamp
const timestamp = generateTimestamp();

// Generate unique ID
const id = generateUniqueId();

// Generate expiration time
const expiresAt = generateExpirationTime(24); // 24 hours
```

### **Serialization**
```typescript
// Serialize for IPFS
const serialized = serializeForIPFS(data);

// Deserialize from IPFS
const data = deserializeFromIPFS(serialized);

// Create IPFS CID
const cid = await createIPFSCID(data);
```

## 📱 **Mobile-First Features**

### **QR Code Generation**
```typescript
const qrData: QRCodeData = {
  type: "custodian-invitation",
  version: "1.0",
  timestamp: generateTimestamp(),
  expiresAt: generateExpirationTime(24),
  data: {
    invitationId: custodian.id,
    identityId: identity.id,
    identityName: identity.metadata.displayName,
    custodianName: custodian.name,
    contactType: custodian.contactType,
    contactValue: custodian.contactValue,
    deepLinkUrl: `identity-protocol://custodian-invitation?data=${btoa(JSON.stringify(data))}`,
    qrCodeDataURL: ""
  }
};
```

### **Deep Link Processing**
```typescript
const processDeepLink = (url: string) => {
  const urlObj = new URL(url);
  if (urlObj.protocol === "identity-protocol:") {
    const action = urlObj.hostname;
    const data = JSON.parse(atob(urlObj.searchParams.get("data") || ""));
    return { action, data };
  }
  return null;
};
```

## 🔐 **Security Features**

### **Validation**
```typescript
// Check if data is expired
const isExpired = (timestamp: string) => new Date(timestamp) < new Date();

// Validate email
const isValidEmail = validateEmail("user@example.com");

// Validate phone
const isValidPhone = validatePhone("+1234567890");
```

### **Type Guards**
```typescript
// Check if object is identity document
if (isIdentityDocument(obj)) {
  // obj is typed as IdentityDocument
}

// Check if object is recovery custodian
if (isRecoveryCustodian(obj)) {
  // obj is typed as RecoveryCustodian
}

// Check if object is QR code data
if (isQRCodeData(obj)) {
  // obj is typed as QRCodeData
}
```

## 📊 **Constants**

```typescript
PROTOCOL_VERSION = "1.0.0"
CONTEXT_URL = "https://identity-protocol.com/v1"
MAX_CUSTODIANS = 5
MIN_CUSTODIANS = 2
DEFAULT_RECOVERY_THRESHOLD = 2
QR_CODE_EXPIRATION_HOURS = 24
DEVICE_SYNC_EXPIRATION_HOURS = 1
```

## 🚨 **Error Codes**

```typescript
ERROR_CODES = {
  INVALID_IDENTITY_DOCUMENT: "INVALID_IDENTITY_DOCUMENT",
  INVALID_CUSTODIAN_DATA: "INVALID_CUSTODIAN_DATA",
  INVALID_QR_CODE_DATA: "INVALID_QR_CODE_DATA",
  EXPIRED_DATA: "EXPIRED_DATA",
  INVALID_SIGNATURE: "INVALID_SIGNATURE",
  INSUFFICIENT_CUSTODIANS: "INSUFFICIENT_CUSTODIANS",
  TOO_MANY_CUSTODIANS: "TOO_MANY_CUSTODIANS",
  INVALID_CONTACT_INFO: "INVALID_CONTACT_INFO",
  INVALID_DEVICE_TYPE: "INVALID_DEVICE_TYPE",
  SERIALIZATION_ERROR: "SERIALIZATION_ERROR",
  DESERIALIZATION_ERROR: "DESERIALIZATION_ERROR",
  MIGRATION_ERROR: "MIGRATION_ERROR",
  VERSION_MISMATCH: "VERSION_MISMATCH"
}
```

## 🎯 **Common Patterns**

### **Add Custodian**
```typescript
const addCustodian = (identity: IdentityDocument, name: string, contactType: "email" | "phone", contactValue: string) => {
  const custodian: RecoveryCustodian = {
    id: generateUniqueId(),
    name,
    type: "person",
    status: "pending",
    contactType,
    contactValue,
    publicKey: "",
    metadata: {
      verificationMethod: "qr-code",
      invitationExpiresAt: generateExpirationTime(24)
    },
    addedAt: generateTimestamp(),
    canApprove: false,
    trustLevel: "medium"
  };
  
  identity.custodians.push(custodian);
  return custodian;
};
```

### **Create Recovery Request**
```typescript
const createRecoveryRequest = (identity: IdentityDocument, claimantContact: string) => {
  const request: RecoveryRequest = {
    id: generateUniqueId(),
    requestingDid: identity.id,
    requestingUser: identity.metadata.username,
    timestamp: generateTimestamp(),
    status: "pending",
    approvals: [],
    denials: [],
    claimantContactValue: claimantContact,
    expiresAt: generateExpirationTime(72), // 72 hours
    requiredApprovals: identity.recoveryConfig.threshold,
    currentApprovals: 0
  };
  
  return request;
};
```

### **Validate and Process**
```typescript
const processIdentityData = (data: any) => {
  // Validate
  if (!validateIdentityDocument(data)) {
    throw new Error("Invalid identity document");
  }
  
  // Check expiration
  if (isExpired(data.updatedAt)) {
    throw new Error("Data has expired");
  }
  
  // Process
  return data as IdentityDocument;
};
```

## 📚 **Documentation Links**

- **Full Standards**: `docs/identity-protocol-standards.md`
- **Implementation Guide**: `docs/implementation-guide.md`
- **Summary**: `docs/metadata-standards-summary.md`
- **TypeScript Interfaces**: `core/identity-core/src/types/metadata-standards.ts`

## 🚀 **Next Steps**

1. **Import standards** into your project
2. **Implement validation** for data integrity
3. **Add QR code generation** for mobile communication
4. **Integrate IPFS** for decentralized storage
5. **Test with real scenarios** for validation

**The standards are ready for immediate use and will provide a solid foundation for your decentralized identity application!** 