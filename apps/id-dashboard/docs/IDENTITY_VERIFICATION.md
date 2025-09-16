# Identity Verification System

## Overview

The par Noir Identity Verification System provides secure, fraud-resistant identity verification using industry-leading providers like Veriff, Jumio, and Onfido. The system generates Zero-Knowledge Proofs (ZKPs) for all verified data points, maintaining privacy while ensuring authenticity.

## Features

### 💰 **Decentralized Payment System**
- **User-Paid Verification**: Users pay for their own verification ($5.00 USD)
- **One-Time Payment**: No recurring fees - pay once, verified for 1 year
- **Cryptocurrency Payments**: Bitcoin, Ethereum, XRP, and USDT support
- **Coinbase Commerce Integration**: Secure payment processing
- **Payment Verification**: Automatic payment confirmation before verification

### 🔐 **Comprehensive Verification**
- **Document Verification**: Supports driver's licenses, passports, state IDs, and national IDs
- **Biometric Matching**: Compares selfie with document photo
- **Liveness Detection**: Prevents spoofing attacks using photos or videos
- **Fraud Prevention**: Advanced risk assessment and fraud detection

### 🛡️ **Security Standards**
- **Zero-Knowledge Proofs**: All verified data is protected with ZKPs
- **End-to-End Encryption**: All data is encrypted in transit and at rest
- **Fraud Prevention**: Multi-layered fraud detection and prevention
- **Audit Logging**: Complete audit trail for compliance

### 🌍 **Global Support**
- **Multiple Providers**: Veriff, Jumio, Onfido support
- **Country Coverage**: Support for 20+ countries
- **Document Types**: Multiple government-issued document types
- **Localization**: Multi-language support

## Architecture

### Components

```
Identity Verification System
├── IdentityVerificationModal.tsx     # UI Component
├── identityVerificationService.ts    # Core Service
├── verifiedIdentityManager.ts        # Data Management
├── verificationConfig.ts             # Configuration
└── verifiedIdentity.ts               # Types
```

### Data Flow

1. **Payment**: User pays $5.00 USD using cryptocurrency (BTC, ETH, XRP, USDT)
2. **Payment Confirmation**: Coinbase Commerce confirms payment via webhook
3. **User Upload**: User uploads ID document and takes selfie
4. **Liveness Check**: System performs liveness detection
5. **Provider Verification**: Document sent to verification provider
6. **Fraud Prevention**: Multi-layer fraud detection analysis
7. **Data Extraction**: Identity data extracted from document
8. **ZKP Generation**: Zero-knowledge proofs generated for all data points
9. **Storage**: Verified data stored securely with ZKPs

## Usage

### Basic Integration

```typescript
import { IdentityVerificationModal } from './components/IdentityVerificationModal';
import { verifiedIdentityManager } from './services/verifiedIdentityManager';

// Open verification modal
const [showModal, setShowModal] = useState(false);

// Handle verification completion
const handleVerificationComplete = async (verifiedData: VerifiedIdentityData) => {
  console.log('Verification completed:', verifiedData);
  // Access verified data points
  const identityProof = verifiedData.dataPoints.identity_attestation;
  const ageProof = verifiedData.dataPoints.age_attestation;
};

// Check verification status
const status = await verifiedIdentityManager.getVerificationStatus(identityId);
```

### Verification Process

1. **Payment**: User selects cryptocurrency and pays $5.00 USD
2. **Payment Confirmation**: System confirms payment via Coinbase Commerce
3. **Upload Document**: User uploads government-issued ID
4. **Capture Selfie**: User takes a selfie for biometric matching
5. **Liveness Check**: System verifies user is real (not a photo/video)
6. **Processing**: Document analyzed and data extracted
7. **ZKP Generation**: Zero-knowledge proofs created for all data points

## Pricing

### Competitive Pricing Model

par Noir offers the most economical identity verification in the market:

| Service | Pricing Model | Annual Cost |
|---------|---------------|-------------|
| **Meta Verified** | $14.99/month | $179.88/year |
| **X Premium** | $8/month | $96/year |
| **par Noir** | $5.00 one-time | $5.00/year |

### Value Proposition

- **95% cheaper** than X Premium annually
- **97% cheaper** than Meta Verified annually
- **One-time payment** - no recurring fees
- **1-year validity** - same as competitors
- **Cryptocurrency payments** - decentralized and secure
- **ZKP protection** - enhanced privacy and security

### What You Get

For just $5.00, users receive:
- ✅ Document authenticity verification
- ✅ Biometric matching and liveness detection
- ✅ Advanced fraud prevention analysis
- ✅ Zero-knowledge proof generation
- ✅ 1-year verification validity
- ✅ Cross-platform compatibility
- ✅ Privacy-first approach

## Configuration

### Environment Variables

```bash
# Veriff Configuration
REACT_APP_VERIFF_API_KEY=your_veriff_api_key
REACT_APP_VERIFF_API_SECRET=your_veriff_api_secret
REACT_APP_VERIFF_WEBHOOK_URL=your_webhook_url

# Jumio Configuration
REACT_APP_JUMIO_API_KEY=your_jumio_api_key
REACT_APP_JUMIO_API_SECRET=your_jumio_api_secret
REACT_APP_JUMIO_WEBHOOK_URL=your_webhook_url

# Onfido Configuration
REACT_APP_ONFIDO_API_KEY=your_onfido_api_key
REACT_APP_ONFIDO_API_SECRET=your_onfido_api_secret
REACT_APP_ONFIDO_WEBHOOK_URL=your_webhook_url

# Global Settings
REACT_APP_VERIFICATION_PROVIDER=veriff
REACT_APP_VERIFICATION_FRAUD_THRESHOLD=0.3
REACT_APP_VERIFICATION_CONFIDENCE_THRESHOLD=0.8
```

### Provider Configuration

```typescript
import { getVerificationConfig } from './config/verificationConfig';

const config = getVerificationConfig();

// Enable specific providers
config.providers.veriff.enabled = true;
config.providers.jumio.enabled = false;
config.providers.onfido.enabled = false;

// Set fraud thresholds
config.globalSettings.fraudThreshold = 0.3;
config.globalSettings.confidenceThreshold = 0.8;
```

## Data Points

### Verified Data Points

The system generates ZKPs for the following data points:

#### Identity Attestation
- **Fields**: firstName, lastName, middleName
- **ZKP Type**: identity_verification
- **Privacy**: private
- **Expiration**: 1 year

#### Age Attestation
- **Fields**: dateOfBirth
- **ZKP Type**: age_verification
- **Privacy**: selective
- **Expiration**: 1 year

#### Location Verification
- **Fields**: country, region, city, postalCode
- **ZKP Type**: location_verification
- **Privacy**: private
- **Expiration**: 1 year

#### Document Verification
- **Fields**: documentType, documentNumber, issuingAuthority, expirationDate
- **ZKP Type**: document_verification
- **Privacy**: private
- **Expiration**: 1 year

## Fraud Prevention

### Multi-Layer Protection

1. **Document Authenticity**
   - Watermark detection
   - Hologram verification
   - Security feature analysis
   - OCR quality assessment

2. **Biometric Matching**
   - Facial feature extraction
   - Photo comparison algorithms
   - Confidence scoring
   - Quality assessment

3. **Liveness Detection**
   - Blink detection
   - Head movement analysis
   - Spoofing detection
   - Real-time verification

4. **Risk Assessment**
   - Fraud indicator analysis
   - Risk score calculation
   - Confidence scoring
   - Multi-factor validation

### Risk Scoring

- **0.0 - 0.2**: Low risk (approved)
- **0.2 - 0.3**: Medium risk (review required)
- **0.3 - 0.5**: High risk (likely rejection)
- **0.5 - 1.0**: Very high risk (rejected)

## Security Features

### Encryption
- **AES-256**: All data encrypted at rest
- **TLS 1.3**: All data encrypted in transit
- **End-to-End**: Client-side encryption before transmission

### Privacy
- **Zero-Knowledge**: ZKPs protect user data
- **Local Storage**: All data stored locally
- **No Tracking**: No user behavior tracking
- **Data Minimization**: Only necessary data collected

### Compliance
- **GDPR**: Full GDPR compliance
- **CCPA**: California Consumer Privacy Act compliance
- **SOX**: Sarbanes-Oxley compliance (optional)
- **Audit Logging**: Complete audit trail

## API Reference

### IdentityVerificationModal

```typescript
interface IdentityVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerificationComplete: (verifiedData: VerifiedIdentityData) => void;
  identityId?: string;
}
```

### VerifiedIdentityManager

```typescript
class VerifiedIdentityManager {
  // Start verification process
  async startVerification(request: VerificationRequest): Promise<VerificationResult>;
  
  // Get verified identity data
  async getVerifiedIdentity(identityId: string): Promise<VerifiedIdentityData | null>;
  
  // Get specific verified data point
  async getVerifiedDataPoint(identityId: string, dataPointId: string): Promise<VerifiedDataPoint | null>;
  
  // Check if identity is verified
  async isIdentityVerified(identityId: string): Promise<boolean>;
  
  // Get verification status
  async getVerificationStatus(identityId: string): Promise<VerificationStatus>;
  
  // Revoke verification
  async revokeVerification(identityId: string): Promise<boolean>;
}
```

## Error Handling

### Common Errors

- **Document Quality**: Poor image quality or lighting
- **Liveness Failure**: Liveness check failed
- **Biometric Mismatch**: Selfie doesn't match document photo
- **Document Authenticity**: Document authenticity could not be verified
- **Risk Score**: Risk score exceeds threshold
- **Confidence**: Confidence score below threshold

### Error Recovery

```typescript
try {
  const result = await verifiedIdentityManager.startVerification(request);
  if (!result.success) {
    console.error('Verification failed:', result.error);
    // Handle error appropriately
  }
} catch (error) {
  console.error('Verification error:', error);
  // Handle unexpected errors
}
```

## Testing

### Mock Provider

For development and testing, use the mock provider:

```typescript
const config = getVerificationConfig();
config.defaultProvider = 'mock';
config.providers.mock.enabled = true;
```

### Test Data

The mock provider uses simulated data:
- **Name**: John Doe
- **DOB**: 1990-01-01
- **Document**: A1234567
- **Location**: Los Angeles, CA, US

## Deployment

### Production Setup

1. **Configure Providers**: Set up API keys for chosen providers
2. **Set Thresholds**: Configure fraud and confidence thresholds
3. **Enable Security**: Enable all security features
4. **Test Integration**: Verify provider integration
5. **Monitor**: Set up monitoring and alerting

### Environment Configuration

```bash
# Production environment
NODE_ENV=production
REACT_APP_VERIFICATION_PROVIDER=veriff
REACT_APP_VERIFF_API_KEY=prod_api_key
REACT_APP_VERIFF_API_SECRET=prod_api_secret
```

## Support

### Documentation
- [Veriff API Documentation](https://developers.veriff.com/)
- [Jumio API Documentation](https://developers.jumio.com/)
- [Onfido API Documentation](https://documentation.onfido.com/)

### Contact
- **Technical Support**: [support@parnoir.com](mailto:support@parnoir.com)
- **Security Issues**: [security@parnoir.com](mailto:security@parnoir.com)

---

**Last Updated**: December 2024  
**Version**: 1.0.0  
**Status**: Production Ready
