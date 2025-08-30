# Standard Data Points API

## Overview

The Standard Data Points API provides a unified system for requesting user data through standardized, privacy-preserving data points. Instead of custom fields, developers request predefined data points that generate Zero-Knowledge Proofs (ZKPs).

## Key Features

- **Standardized Data Points**: Predefined data points for common verification needs
- **ZKP Generation**: Automatic generation of privacy-preserving proofs
- **Global Privacy Settings**: Users control data sharing globally
- **Verification Levels**: Basic, enhanced, and verified proof levels
- **Expiration Management**: Time-limited proofs for security

## Available Data Points

### Verification Data Points

#### `age_verification`
- **Purpose**: Verify user is above a certain age
- **Required Fields**: `age` (number)
- **ZKP Type**: `age_verification`
- **Examples**: 18+ verification, 21+ verification, age range proof

#### `email_verification`
- **Purpose**: Verify user has access to an email address
- **Required Fields**: `email` (string)
- **ZKP Type**: `email_verification`
- **Examples**: Account recovery, communication preferences

#### `phone_verification`
- **Purpose**: Verify user has access to a phone number
- **Required Fields**: `phone` (string)
- **ZKP Type**: `phone_verification`
- **Examples**: SMS verification, two-factor authentication

#### `location_verification`
- **Purpose**: Verify user is in a specific location or region
- **Required Fields**: `country`, `region`
- **Optional Fields**: `city`, `postalCode`
- **ZKP Type**: `location_verification`
- **Examples**: Regional content, compliance requirements

#### `identity_verification`
- **Purpose**: Verify user identity with government documents
- **Required Fields**: `documentType`, `documentNumber`
- **Optional Fields**: `fullName`, `dateOfBirth`, `expiryDate`
- **ZKP Type**: `identity_verification`
- **Examples**: KYC compliance, financial services

### Preference Data Points

#### `communication_preferences`
- **Purpose**: User communication channel preferences
- **Required Fields**: `emailEnabled`, `smsEnabled`
- **Optional Fields**: `marketingEnabled`, `frequency`
- **ZKP Type**: `preference_disclosure`

#### `privacy_preferences`
- **Purpose**: User privacy and data sharing preferences
- **Required Fields**: `dataSharing`, `analytics`
- **Optional Fields**: `thirdPartySharing`, `dataRetention`
- **ZKP Type**: `preference_disclosure`

### Compliance Data Points

#### `gdpr_consent`
- **Purpose**: GDPR-compliant data processing consent
- **Required Fields**: `consentGiven`, `consentDate`
- **Optional Fields**: `specificPurposes`, `withdrawalDate`
- **ZKP Type**: `compliance_attestation`

#### `terms_acceptance`
- **Purpose**: User acceptance of terms and conditions
- **Required Fields**: `accepted`, `acceptanceDate`
- **Optional Fields**: `version`, `ipAddress`
- **ZKP Type**: `compliance_attestation`

## API Endpoints

### Request Data Collection

```http
POST /api/data-collection/request
```

**Request Body:**
```json
{
  "platform": "your-platform",
  "dataPoints": ["age_verification", "email_verification"],
  "verificationLevel": "enhanced",
  "expirationDays": 30,
  "consentText": "I consent to data collection",
  "dataUsage": "Account verification",
  "purpose": "Age and email verification"
}
```

**Response:**
```json
{
  "success": true,
  "proofs": [
    {
      "dataPointId": "age_verification",
      "proofType": "age_verification",
      "proof": "encrypted_zkp_proof",
      "signature": "cryptographic_signature",
      "timestamp": "2024-01-01T00:00:00Z",
      "expiresAt": "2024-02-01T00:00:00Z",
      "verificationLevel": "enhanced",
      "metadata": {
        "requestedBy": "your-platform",
        "userConsent": true,
        "dataProvided": ["age"]
      }
    }
  ],
  "dataPoints": ["age_verification", "email_verification"],
  "timestamp": "2024-01-01T00:00:00Z"
}
```

### Request Single Data Point

```http
POST /api/data-collection/single
```

**Request Body:**
```json
{
  "dataPointId": "age_verification",
  "platform": "your-platform",
  "purpose": "Age verification for alcohol purchase",
  "verificationLevel": "enhanced",
  "expirationDays": 7
}
```

### Get Available Data Points

```http
GET /api/data-collection/available
```

**Response:**
```json
{
  "success": true,
  "dataPoints": [
    {
      "id": "age_verification",
      "name": "Age Verification",
      "description": "Verify user is above a certain age",
      "category": "verification",
      "dataType": "number",
      "zkpType": "age_verification",
      "requiredFields": ["age"],
      "optionalFields": [],
      "defaultPrivacy": "selective",
      "examples": ["18+ verification", "21+ verification"]
    }
  ]
}
```

## SDK Usage

### JavaScript/TypeScript

```javascript
import { createIdentitySDK } from '@identity-protocol/identity-sdk';

const sdk = createIdentitySDK(config);

// Request multiple data points
const result = await sdk.requestDataCollection({
  platform: 'my-app',
  dataPoints: ['age_verification', 'email_verification'],
  verificationLevel: 'enhanced',
  expirationDays: 30,
  consentText: 'I consent to data collection',
  dataUsage: 'Account verification',
  purpose: 'Age and email verification'
});

// Request single data point
const ageProof = await sdk.requestStandardDataPoint({
  dataPointId: 'age_verification',
  platform: 'my-app',
  purpose: 'Age verification',
  verificationLevel: 'basic',
  expirationDays: 7
});

// Get available data points
const allDataPoints = sdk.getAvailableDataPoints();
const verificationPoints = sdk.getDataPointsByCategory('verification');
```

### Python

```python
import requests

# Request data collection
response = requests.post('https://api.parnoir.com/api/data-collection/request', json={
    'platform': 'my-app',
    'dataPoints': ['age_verification', 'email_verification'],
    'verificationLevel': 'enhanced',
    'expirationDays': 30,
    'consentText': 'I consent to data collection',
    'dataUsage': 'Account verification',
    'purpose': 'Age and email verification'
})

proofs = response.json()['proofs']
```

## Privacy & Security

### Global Privacy Settings

Users can control data sharing globally through the Privacy & Sharing tab:

- **Allow All Tool Access**: Master override for all data points
- **Individual Data Point Controls**: Enable/disable specific data points
- **Tool-Specific Permissions**: Control access per platform

### ZKP Generation

Each data point generates privacy-preserving proofs:

- **Age Verification**: Proves age is above threshold without revealing actual age
- **Email Verification**: Proves email ownership without revealing email address
- **Location Verification**: Proves location without revealing exact coordinates
- **Identity Verification**: Proves identity without revealing document details

### Verification Levels

- **Basic**: Standard verification with minimal data exposure
- **Enhanced**: Additional verification steps for higher security
- **Verified**: Highest level of verification with cryptographic guarantees

## Error Handling

### Common Errors

```json
{
  "success": false,
  "error": "Invalid data point: unknown_data_point",
  "code": "INVALID_DATA_POINT"
}
```

```json
{
  "success": false,
  "error": "User consent required",
  "code": "CONSENT_REQUIRED"
}
```

```json
{
  "success": false,
  "error": "Data point globally blocked",
  "code": "DATA_POINT_BLOCKED"
}
```

### Error Codes

- `INVALID_DATA_POINT`: Requested data point does not exist
- `CONSENT_REQUIRED`: User has not provided consent
- `DATA_POINT_BLOCKED`: Data point is globally disabled
- `VALIDATION_ERROR`: User data validation failed
- `ZKP_GENERATION_ERROR`: Failed to generate ZKP proof
- `EXPIRED_REQUEST`: Request has expired

## Best Practices

### For Developers

1. **Request Only Necessary Data**: Only request data points you actually need
2. **Clear Purpose**: Provide clear, specific purpose for data collection
3. **Respect User Choices**: Honor user privacy settings
4. **Handle Expiration**: Check proof expiration dates
5. **Secure Storage**: Store ZKP proofs securely

### For Users

1. **Review Requests**: Carefully review data collection requests
2. **Global Settings**: Use global privacy settings for consistent control
3. **Monitor Usage**: Check which platforms have access to your data
4. **Revoke Access**: Revoke access when no longer needed

## Rate Limiting

- **Requests per minute**: 10 requests per minute per platform
- **Data points per request**: Maximum 5 data points per request
- **Concurrent requests**: Maximum 3 concurrent requests per user

## Support

For API support and questions:
- **Documentation**: [docs.parnoir.com](https://docs.parnoir.com)
- **SDK Repository**: [github.com/parnoir/identity-sdk](https://github.com/parnoir/identity-sdk)
- **API Status**: [status.parnoir.com](https://status.parnoir.com)
