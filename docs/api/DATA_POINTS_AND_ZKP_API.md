# 🔐 Data Points & ZKP API Documentation

## Overview

The Identity Protocol provides a comprehensive system for requesting and managing user data points with automatic Zero-Knowledge Proof (ZKP) generation. This system enables platforms to request specific data from users while maintaining privacy and cryptographic integrity.

## 🎯 Key Features

- **Standardized Data Points**: Predefined data points for common verification needs
- **Automatic ZKP Generation**: Cryptographic proofs generated automatically
- **Privacy-Preserving**: Users control what data they share
- **Verification Levels**: Multiple levels of data verification
- **Expiration Management**: Time-limited data access
- **Community Proposals**: Developers can propose new standard data points

## 📋 Available Standard Data Points

### Core Identity Verification

#### `age_attestation`
- **Description**: User's attested age (date of birth)
- **Data Type**: `date`
- **Required Fields**: `dateOfBirth`
- **ZKP Type**: `age_verification`
- **Default Privacy**: `selective`
- **Examples**: Age-restricted content, Age verification services, Compliance requirements

#### `identity_attestation`
- **Description**: Legal name (first, middle, last)
- **Data Type**: `object`
- **Required Fields**: `firstName`, `middleName`, `lastName`
- **ZKP Type**: `identity_attestation`
- **Default Privacy**: `private`
- **Examples**: Identity verification, Name verification, Compliance requirements

### Location & Geography

#### `location_verification`
- **Description**: Current device location
- **Data Type**: `object`
- **Required Fields**: `latitude`, `longitude`
- **ZKP Type**: `location_verification`
- **Default Privacy**: `selective`
- **Examples**: Location-based services, Geographic restrictions, Local content

#### `email_verification`
- **Description**: Verified email address
- **Data Type**: `string`
- **Required Fields**: `email`
- **ZKP Type**: `email_verification`
- **Default Privacy**: `selective`
- **Examples**: Account verification, Communication preferences, Security notifications

#### `phone_verification`
- **Description**: Verified phone number
- **Data Type**: `string`
- **Required Fields**: `phoneNumber`
- **ZKP Type**: `phone_verification`
- **Default Privacy**: `selective`
- **Examples**: Two-factor authentication, SMS notifications, Account recovery

## 🔄 API Endpoints

### Request Data Collection

**Endpoint**: `POST /api/data/request`

**Description**: Request multiple data points from a user with ZKP generation.

**Request Body**:
```json
{
  "platform": "string",
  "dataPoints": ["age_attestation", "identity_attestation"],
  "verificationLevel": "basic" | "enhanced" | "verified",
  "expirationDays": 30,
  "consentText": "string",
  "dataUsage": "string",
  "purpose": "string"
}
```

**Response**:
```json
{
  "success": true,
  "proofs": [
    {
      "proofId": "zkp_123456789",
      "dataPointId": "age_attestation",
      "proofType": "age_verification",
      "proofData": {
        "encryptedData": "encrypted_user_data",
        "zkpToken": "zkp_proof_token",
        "attestedAt": "2024-01-15T10:30:00Z",
        "attestedBy": "user_identity_id",
        "dataType": "attested",
        "expiresAt": "2024-02-15T10:30:00Z"
      },
      "signature": "cryptographic_signature",
      "timestamp": "2024-01-15T10:30:00Z"
    }
  ],
  "dataPoints": ["age_attestation", "identity_attestation"],
  "timestamp": "2024-01-15T10:30:00Z",
  "expiresAt": "2024-02-15T10:30:00Z"
}
```

### Request Single Data Point

**Endpoint**: `POST /api/data/point`

**Description**: Request a single data point with ZKP generation.

**Request Body**:
```json
{
  "dataPointId": "age_attestation",
  "platform": "string",
  "purpose": "string",
  "verificationLevel": "basic" | "enhanced" | "verified",
  "expirationDays": 90
}
```

**Response**:
```json
{
  "success": true,
  "proof": {
    "proofId": "zkp_123456789",
    "dataPointId": "age_attestation",
    "proofType": "age_verification",
    "proofData": {
      "encryptedData": "encrypted_user_data",
      "zkpToken": "zkp_proof_token",
      "attestedAt": "2024-01-15T10:30:00Z",
      "attestedBy": "user_identity_id",
      "dataType": "attested",
      "expiresAt": "2024-04-15T10:30:00Z"
    },
    "signature": "cryptographic_signature",
    "timestamp": "2024-01-15T10:30:00Z"
  },
  "dataPoint": {
    "id": "age_attestation",
    "name": "Age Attestation",
    "description": "Attest to your age for age-restricted services",
    "category": "verification",
    "dataType": "date",
    "zkpType": "age_verification",
    "requiredFields": ["dateOfBirth"],
    "defaultPrivacy": "selective"
  }
}
```

### Get Available Data Points

**Endpoint**: `GET /api/data/points`

**Description**: Get all available standard data points.

**Query Parameters**:
- `category` (optional): Filter by category (`verification`, `location`)

**Response**:
```json
{
  "success": true,
  "dataPoints": [
    {
      "id": "age_attestation",
      "name": "Age Attestation",
      "description": "Attest to your age for age-restricted services",
      "category": "verification",
      "dataType": "date",
      "zkpType": "age_verification",
      "requiredFields": ["dateOfBirth"],
      "defaultPrivacy": "selective",
      "examples": ["Age-restricted content", "Age verification services"]
    }
  ]
}
```

### Propose New Data Point

**Endpoint**: `POST /api/data/propose`

**Description**: Propose a new standard data point for community approval.

**Request Body**:
```json
{
  "name": "Income Verification",
  "description": "Verify user income for financial services",
  "category": "verification",
  "dataType": "number",
  "requiredFields": ["annualIncome", "currency"],
  "examples": ["Loan applications", "Credit checks"],
  "useCase": "Financial institutions need to verify user income for loan eligibility"
}
```

**Response**:
```json
{
  "success": true,
  "proposalId": "proposal_123456789"
}
```

### Vote on Proposal

**Endpoint**: `POST /api/data/vote`

**Description**: Vote on a data point proposal.

**Request Body**:
```json
{
  "proposalId": "proposal_123456789",
  "voterId": "string",
  "vote": "upvote" | "downvote"
}
```

**Response**:
```json
{
  "success": true
}
```

### Get Pending Proposals

**Endpoint**: `GET /api/data/proposals`

**Description**: Get all pending data point proposals.

**Response**:
```json
{
  "success": true,
  "proposals": [
    {
      "id": "proposal_123456789",
      "proposedAt": "2024-01-15T10:30:00Z",
      "status": "pending",
      "votes": {
        "upvotes": 5,
        "downvotes": 2,
        "voters": ["voter1", "voter2"]
      },
      "name": "Income Verification",
      "description": "Verify user income for financial services",
      "category": "verification",
      "dataType": "number",
      "requiredFields": ["annualIncome", "currency"],
      "examples": ["Loan applications", "Credit checks"],
      "useCase": "Financial institutions need to verify user income for loan eligibility"
    }
  ]
}
```

## 🔐 ZKP Verification

### Verifying ZKP Proofs

Before using any data from a ZKP proof, platforms must verify the proof's integrity:

```javascript
async function verifyZKProof(proof) {
  try {
    // 1. Check proof expiration
    if (new Date(proof.proofData.expiresAt) < new Date()) {
      throw new Error('Proof has expired');
    }

    // 2. Verify cryptographic signature
    const isValidSignature = await verifySignature(proof.signature, proof.proofData);
    if (!isValidSignature) {
      throw new Error('Invalid proof signature');
    }

    // 3. Verify ZKP token
    const isValidZKP = await verifyZKPToken(proof.proofData.zkpToken);
    if (!isValidZKP) {
      throw new Error('Invalid ZKP token');
    }

    // 4. Check attestation source
    if (proof.proofData.attestedBy !== expectedUserId) {
      throw new Error('Proof from unexpected user');
    }

    return true;
  } catch (error) {
    console.error('ZKP verification failed:', error);
    return false;
  }
}
```

### Extracting Data from Proofs

```javascript
function extractAgeFromProof(proof) {
  if (proof.dataPointId !== 'age_attestation') {
    throw new Error('Invalid data point type');
  }
  
  // Decrypt and extract age data
  const decryptedData = decryptData(proof.proofData.encryptedData);
  const dateOfBirth = new Date(decryptedData.dateOfBirth);
  const age = calculateAge(dateOfBirth);
  
  return age;
}

function extractLocationFromProof(proof) {
  if (proof.dataPointId !== 'location_verification') {
    throw new Error('Invalid data point type');
  }
  
  // Decrypt and extract location data
  const decryptedData = decryptData(proof.proofData.encryptedData);
  
  return {
    latitude: decryptedData.latitude,
    longitude: decryptedData.longitude
  };
}
```

## 🛡️ Security Considerations

### Best Practices

1. **Always verify ZKP proofs** before using any data
2. **Check expiration dates** - proofs have limited validity
3. **Verify cryptographic signatures** - ensures data integrity
4. **Validate attestation sources** - ensure proof comes from expected user
5. **Handle verification failures gracefully** - provide clear error messages
6. **Store proofs securely** - treat ZKP proofs as sensitive data
7. **Implement rate limiting** - prevent abuse of verification endpoints
8. **Log verification attempts** - for audit and security monitoring

### Privacy Best Practices

1. **Minimal data collection** - only request data points you actually need
2. **Clear consent** - provide clear explanations of data usage
3. **Limited retention** - set appropriate expiration dates for proofs
4. **User control** - allow users to revoke access to their data
5. **Transparent processing** - be clear about how data is used
6. **Secure storage** - encrypt stored proofs and user data
7. **Regular audits** - review data collection practices regularly

## 📱 SDK Integration

### JavaScript/TypeScript SDK

```javascript
import { createIdentitySDK } from '@identity-protocol/identity-sdk';

const sdk = createIdentitySDK({
  clientId: 'your-client-id',
  redirectUri: 'https://your-app.com/callback'
});

// Request age verification
const ageResponse = await sdk.requestStandardDataPoint({
  dataPointId: 'age_attestation',
  platform: 'your-platform-id',
  purpose: 'Age verification for content access',
  verificationLevel: 'enhanced',
  expirationDays: 365
});

if (ageResponse.success) {
  const proof = ageResponse.proof;
  const userAge = extractAgeFromProof(proof);
  
  if (userAge >= 18) {
    console.log('User is verified as adult');
  }
}
```

### React Integration

```javascript
import { useIdentitySDK } from '@identity-protocol/identity-sdk';

function AgeVerificationComponent() {
  const { requestStandardDataPoint } = useIdentitySDK(config);

  const handleAgeVerification = async () => {
    const response = await requestStandardDataPoint({
      dataPointId: 'age_attestation',
      platform: 'age-restricted-platform',
      purpose: 'Age verification for content access'
    });

    if (response.success) {
      // Handle successful verification
      console.log('Age verification successful');
    }
  };

  return (
    <button onClick={handleAgeVerification}>
      Verify Age
    </button>
  );
}
```

## 🚀 Use Cases

### Age-Restricted Content Platform

```javascript
class AgeRestrictedPlatform {
  async checkUserAccess(userId) {
    try {
      const ageResponse = await sdk.requestStandardDataPoint({
        dataPointId: 'age_attestation',
        platform: 'age-restricted-platform',
        purpose: 'Age verification for content access',
        verificationLevel: 'enhanced',
        expirationDays: 365
      });

      if (ageResponse.success) {
        const proof = ageResponse.proof;
        const userAge = this.calculateAgeFromProof(proof);
        
        if (userAge >= 18) {
          return { access: true, age: userAge, proof: proof.proofId };
        } else {
          return { access: false, reason: 'Underage user' };
        }
      }
    } catch (error) {
      console.error('Age verification failed:', error);
      return { access: false, reason: 'Verification failed' };
    }
  }
}
```

### Financial Services Platform

```javascript
class FinancialPlatform {
  async verifyUserIdentity(userId) {
    try {
      const kycResponse = await sdk.requestDataCollection({
        platform: 'financial-platform',
        dataPoints: ['identity_attestation', 'email_verification', 'phone_verification'],
        verificationLevel: 'verified',
        expirationDays: 730,
        consentText: 'We need to verify your identity for financial services compliance',
        dataUsage: 'KYC and AML compliance',
        purpose: 'Financial services identity verification'
      });

      if (kycResponse.success) {
        return {
          verified: true,
          proofs: kycResponse.proofs,
          dataPoints: kycResponse.dataPoints,
          expiresAt: kycResponse.expiresAt
        };
      }
    } catch (error) {
      console.error('KYC verification failed:', error);
      return { verified: false, reason: 'Verification failed' };
    }
  }
}
```

### Location-Based Service

```javascript
class LocationService {
  async getNearbyServices(userId) {
    try {
      const locationResponse = await sdk.requestStandardDataPoint({
        dataPointId: 'location_verification',
        platform: 'location-service',
        purpose: 'Find nearby services',
        verificationLevel: 'basic',
        expirationDays: 1 // Short expiration for location data
      });

      if (locationResponse.success) {
        const location = this.extractLocationFromProof(locationResponse.proof);
        return this.findNearbyServices(location);
      }
    } catch (error) {
      console.error('Location verification failed:', error);
      return { error: 'Location access denied' };
    }
  }
}
```

## 🔧 Error Handling

### Common Error Codes

- `INVALID_DATA_POINT` - Requested data point does not exist
- `VERIFICATION_FAILED` - ZKP verification failed
- `PROOF_EXPIRED` - ZKP proof has expired
- `INVALID_SIGNATURE` - Cryptographic signature is invalid
- `ACCESS_DENIED` - User denied access to requested data
- `RATE_LIMITED` - Too many requests, try again later
- `INVALID_PROPOSAL` - Data point proposal is invalid
- `VOTE_FAILED` - Failed to vote on proposal

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "VERIFICATION_FAILED",
    "message": "ZKP verification failed",
    "details": {
      "reason": "Invalid cryptographic signature",
      "proofId": "zkp_123456789"
    }
  }
}
```

## 📊 Rate Limiting

- **Data Point Requests**: 10 requests per minute per user
- **ZKP Verification**: 100 verifications per minute per platform
- **Proposal Submissions**: 5 proposals per day per developer
- **Voting**: 50 votes per day per user

## 🔄 Webhooks

Platforms can register webhooks to receive notifications about data point events:

```json
{
  "event": "data_point.granted",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "userId": "user_123",
    "platform": "your-platform",
    "dataPoints": ["age_attestation"],
    "proofs": [...],
    "expiresAt": "2024-02-15T10:30:00Z"
  }
}
```

Available webhook events:
- `data_point.granted` - User granted access to data point
- `data_point.revoked` - User revoked access to data point
- `data_point.expired` - Data point access expired
- `proposal.created` - New data point proposal created
- `proposal.approved` - Data point proposal approved
- `proposal.rejected` - Data point proposal rejected

---

**For more information, visit [docs.identity-protocol.com](https://docs.identity-protocol.com)**
