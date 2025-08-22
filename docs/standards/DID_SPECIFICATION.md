# DID Specification
## Identity Protocol - Decentralized Identifier Specification

### Abstract

This document defines the Decentralized Identifier (DID) specification for the Identity Protocol, implementing W3C DID standards with additional security and privacy features. This specification ensures interoperability, security, and compliance with industry standards.

### Table of Contents

1. [Overview](#overview)
2. [DID Syntax](#did-syntax)
3. [DID Document Structure](#did-document-structure)
4. [Verification Methods](#verification-methods)
5. [Authentication](#authentication)
6. [Resolution](#resolution)
7. [Security Considerations](#security-considerations)
8. [Privacy Considerations](#privacy-considerations)
9. [Compliance](#compliance)

---

## Overview

### Purpose

The Identity Protocol DID specification provides a standardized way to create, manage, and resolve decentralized identifiers that are:

- **Self-owned**: Users have complete control over their DIDs
- **Portable**: DIDs can be used across different services and platforms
- **Secure**: Built on cryptographic principles with military-grade security
- **Privacy-preserving**: Users control what information is shared
- **Interoperable**: Compliant with W3C DID standards

### Scope

This specification covers:

- DID format and syntax
- DID document structure
- Verification methods
- Authentication protocols
- Resolution mechanisms
- Security and privacy requirements
- Compliance with industry standards

### Conformance

This specification conforms to:

- **W3C DID Core**: https://www.w3.org/TR/did-core/
- **DIF DID Resolution**: https://identity.foundation/did-resolution/
- **W3C Verifiable Credentials**: https://www.w3.org/TR/vc-data-model/

---

## DID Syntax

### DID Format

The Identity Protocol uses the following DID format:

```
did:identity:<identifier>
```

### Components

#### 1. **Scheme**
- **Value**: `did`
- **Purpose**: Identifies this as a Decentralized Identifier
- **Standard**: W3C DID Core specification

#### 2. **Method**
- **Value**: `identity`
- **Purpose**: Identifies the Identity Protocol method
- **Registry**: Registered with W3C DID Method Registry

#### 3. **Identifier**
- **Format**: Base58-encoded string
- **Length**: 16-64 characters
- **Character Set**: `[1-9A-HJ-NP-Za-km-z]`
- **Uniqueness**: Cryptographically guaranteed

### Examples

```
did:identity:123456789abcdef
did:identity:zQ3sharXJ8K2VJqg
did:identity:QmW2WQi7j6c7UgJTarActp7tDNikE4B2qXtFCfLPdsgaTQ
```

### Validation Rules

#### 1. **Format Validation**
```regex
^did:identity:[1-9A-HJ-NP-Za-km-z]{16,64}$
```

#### 2. **Character Set Validation**
- Must use Base58 character set
- No ambiguous characters (0, O, I, l)
- Case-sensitive

#### 3. **Length Validation**
- Minimum: 16 characters
- Maximum: 64 characters
- Recommended: 32-48 characters

#### 4. **Uniqueness Validation**
- Cryptographically generated
- Collision-resistant
- Globally unique

---

## DID Document Structure

### Core Structure

A DID document follows the W3C DID Core specification with Identity Protocol extensions:

```json
{
  "@context": [
    "https://www.w3.org/ns/did/v1",
    "https://identityprotocol.com/contexts/did/v1"
  ],
  "id": "did:identity:123456789abcdef",
  "controller": "did:identity:123456789abcdef",
  "verificationMethod": [
    {
      "id": "did:identity:123456789abcdef#keys-1",
      "type": "Ed25519VerificationKey2020",
      "controller": "did:identity:123456789abcdef",
      "publicKeyMultibase": "zQ3sharXJ8K2VJqg..."
    }
  ],
  "authentication": [
    "did:identity:123456789abcdef#keys-1"
  ],
  "assertionMethod": [
    "did:identity:123456789abcdef#keys-1"
  ],
  "keyAgreement": [
    {
      "id": "did:identity:123456789abcdef#keys-2",
      "type": "X25519KeyAgreementKey2020",
      "controller": "did:identity:123456789abcdef",
      "publicKeyMultibase": "zQ3sharXJ8K2VJqg..."
    }
  ],
  "service": [
    {
      "id": "did:identity:123456789abcdef#linked-domain",
      "type": "LinkedDomains",
      "serviceEndpoint": "https://example.com"
    }
  ],
  "metadata": {
    "created": "2024-01-01T00:00:00Z",
    "updated": "2024-01-01T00:00:00Z",
    "version": "1.0.0"
  }
}
```

### Required Fields

#### 1. **@context**
- **Purpose**: Defines the JSON-LD context
- **Required**: Yes
- **Values**: 
  - `https://www.w3.org/ns/did/v1`
  - `https://identityprotocol.com/contexts/did/v1`

#### 2. **id**
- **Purpose**: The DID identifier
- **Required**: Yes
- **Format**: `did:identity:<identifier>`

#### 3. **verificationMethod**
- **Purpose**: Cryptographic verification methods
- **Required**: Yes
- **Minimum**: 1 verification method

#### 4. **authentication**
- **Purpose**: Authentication verification methods
- **Required**: Yes
- **Minimum**: 1 authentication method

### Optional Fields

#### 1. **controller**
- **Purpose**: Entity controlling the DID
- **Default**: Same as DID identifier
- **Format**: DID or array of DIDs

#### 2. **assertionMethod**
- **Purpose**: Methods for creating assertions
- **Default**: Same as authentication methods

#### 3. **keyAgreement**
- **Purpose**: Methods for key agreement
- **Use Case**: End-to-end encryption

#### 4. **service**
- **Purpose**: Service endpoints
- **Types**: LinkedDomains, DIDComm, etc.

#### 5. **metadata**
- **Purpose**: DID document metadata
- **Fields**: created, updated, version

---

## Verification Methods

### Supported Key Types

#### 1. **Ed25519VerificationKey2020**
```json
{
  "id": "did:identity:123456789abcdef#keys-1",
  "type": "Ed25519VerificationKey2020",
  "controller": "did:identity:123456789abcdef",
  "publicKeyMultibase": "zQ3sharXJ8K2VJqg..."
}
```

**Use Cases:**
- Authentication
- Digital signatures
- Verifiable credentials

**Security Level:** High (256-bit security)

#### 2. **EcdsaSecp256k1VerificationKey2019**
```json
{
  "id": "did:identity:123456789abcdef#keys-2",
  "type": "EcdsaSecp256k1VerificationKey2019",
  "controller": "did:identity:123456789abcdef",
  "publicKeyJwk": {
    "kty": "EC",
    "crv": "secp256k1",
    "x": "...",
    "y": "..."
  }
}
```

**Use Cases:**
- Blockchain integration
- Bitcoin/Ethereum compatibility
- Cross-platform interoperability

#### 3. **X25519KeyAgreementKey2020**
```json
{
  "id": "did:identity:123456789abcdef#keys-3",
  "type": "X25519KeyAgreementKey2020",
  "controller": "did:identity:123456789abcdef",
  "publicKeyMultibase": "zQ3sharXJ8K2VJqg..."
}
```

**Use Cases:**
- Key agreement
- End-to-end encryption
- Secure communication

### Key Generation

#### 1. **Cryptographic Requirements**
- **Random Source**: Cryptographically secure random number generator
- **Algorithm**: Web Crypto API or equivalent
- **Key Size**: 256 bits minimum
- **Curve**: Ed25519, secp256k1, or X25519

#### 2. **Key Storage**
- **Private Keys**: Never stored on servers
- **Public Keys**: Stored in DID documents
- **Backup**: Secure backup mechanisms required

#### 3. **Key Rotation**
- **Frequency**: As needed or compromised
- **Process**: Create new keys, update DID document
- **Revocation**: Mark old keys as revoked

---

## Authentication

### Authentication Methods

#### 1. **Challenge-Response Authentication**

**Process:**
1. **Challenge Generation**
   ```json
   {
     "challenge": "random-challenge-string",
     "expiresAt": "2024-01-01T00:05:00Z",
     "nonce": "unique-nonce-value"
   }
   ```

2. **Challenge Signing**
   ```javascript
   const signature = await crypto.subtle.sign(
     'Ed25519',
     privateKey,
     new TextEncoder().encode(challenge)
   );
   ```

3. **Authentication Request**
   ```json
   {
     "did": "did:identity:123456789abcdef",
     "challenge": "random-challenge-string",
     "signature": "base64-encoded-signature",
     "proof": {
       "type": "Ed25519Signature2020",
       "created": "2024-01-01T00:00:00Z",
       "verificationMethod": "did:identity:123456789abcdef#keys-1",
       "proofPurpose": "authentication"
     }
   }
   ```

#### 2. **JWT Authentication**

**Token Structure:**
```json
{
  "header": {
    "alg": "EdDSA",
    "typ": "JWT"
  },
  "payload": {
    "iss": "did:identity:123456789abcdef",
    "sub": "did:identity:123456789abcdef",
    "aud": "https://api.identityprotocol.com",
    "iat": 1640995200,
    "exp": 1640998800,
    "nonce": "unique-nonce-value"
  },
  "signature": "base64-encoded-signature"
}
```

#### 3. **Multi-Factor Authentication**

**Factors:**
- **Knowledge**: Passcode or password
- **Possession**: Hardware security module
- **Inherence**: Biometric authentication

**Implementation:**
```json
{
  "authentication": [
    "did:identity:123456789abcdef#keys-1",
    "did:identity:123456789abcdef#keys-2"
  ],
  "service": [
    {
      "id": "did:identity:123456789abcdef#2fa",
      "type": "TwoFactorAuthentication",
      "serviceEndpoint": "https://api.identityprotocol.com/2fa"
    }
  ]
}
```

### Security Requirements

#### 1. **Challenge Security**
- **Length**: Minimum 32 characters
- **Entropy**: Cryptographically secure random
- **Expiration**: 5 minutes maximum
- **Uniqueness**: Never reuse challenges

#### 2. **Signature Security**
- **Algorithm**: Ed25519 or ECDSA
- **Hash Function**: SHA-512
- **Verification**: Cryptographic verification required

#### 3. **Session Security**
- **Expiration**: Configurable (default: 1 hour)
- **Refresh**: Secure refresh mechanism
- **Revocation**: Immediate revocation capability

---

## Resolution

### Resolution Process

#### 1. **DID Resolution Request**
```json
{
  "did": "did:identity:123456789abcdef",
  "options": {
    "accept": "application/did+ld+json",
    "timeout": 5000
  }
}
```

#### 2. **Resolution Response**
```json
{
  "didResolutionMetadata": {
    "contentType": "application/did+ld+json",
    "retrieved": "2024-01-01T00:00:00Z",
    "did": {
      "didString": "did:identity:123456789abcdef",
      "methodSpecificId": "123456789abcdef"
    }
  },
  "didDocument": {
    "@context": ["https://www.w3.org/ns/did/v1"],
    "id": "did:identity:123456789abcdef",
    "verificationMethod": [...],
    "authentication": [...]
  },
  "didDocumentMetadata": {
    "created": "2024-01-01T00:00:00Z",
    "updated": "2024-01-01T00:00:00Z",
    "version": "1.0.0"
  }
}
```

### Resolution Endpoints

#### 1. **HTTP Resolution**
```
GET /did:identity:123456789abcdef
Accept: application/did+ld+json
```

#### 2. **JSON-RPC Resolution**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "did_resolve",
  "params": {
    "did": "did:identity:123456789abcdef"
  }
}
```

#### 3. **GraphQL Resolution**
```graphql
query ResolveDID($did: String!) {
  resolveDID(did: $did) {
    didDocument
    metadata {
      created
      updated
      version
    }
  }
}
```

### Caching

#### 1. **Cache Strategy**
- **TTL**: 1 hour for stable DIDs
- **Invalidation**: On DID document updates
- **Storage**: Redis or equivalent

#### 2. **Cache Headers**
```http
Cache-Control: public, max-age=3600
ETag: "did-document-hash"
Last-Modified: 2024-01-01T00:00:00Z
```

---

## Security Considerations

### Cryptographic Security

#### 1. **Key Security**
- **Generation**: Cryptographically secure
- **Storage**: Hardware security modules
- **Transport**: Encrypted channels
- **Backup**: Secure backup mechanisms

#### 2. **Algorithm Security**
- **Signing**: Ed25519, ECDSA P-384
- **Encryption**: AES-256-GCM, ChaCha20-Poly1305
- **Hashing**: SHA-512
- **Key Derivation**: PBKDF2 (1M iterations)

#### 3. **Protocol Security**
- **Authentication**: Multi-factor authentication
- **Authorization**: Role-based access control
- **Audit**: Comprehensive audit trails
- **Monitoring**: Real-time security monitoring

### Threat Model

#### 1. **Attack Vectors**
- **Key Compromise**: Private key theft
- **Man-in-the-Middle**: Network attacks
- **Replay Attacks**: Challenge reuse
- **Brute Force**: Password attacks

#### 2. **Mitigation Strategies**
- **Key Rotation**: Regular key updates
- **Transport Security**: TLS 1.3
- **Challenge Security**: Unique, time-limited challenges
- **Rate Limiting**: Request throttling

### Privacy Protection

#### 1. **Data Minimization**
- **Collection**: Minimal data collection
- **Storage**: Encrypted storage
- **Sharing**: User-controlled sharing
- **Retention**: Configurable retention

#### 2. **Anonymity**
- **Pseudonymity**: DID-based pseudonyms
- **Unlinkability**: Separate DIDs for different contexts
- **Metadata**: Minimal metadata exposure

---

## Privacy Considerations

### Data Protection

#### 1. **Personal Data**
- **Definition**: Any data identifying an individual
- **Processing**: Lawful, fair, transparent
- **Storage**: Encrypted at rest and in transit
- **Access**: User-controlled access

#### 2. **Consent Management**
- **Explicit Consent**: Clear, informed consent
- **Granular Control**: Per-service consent
- **Withdrawal**: Right to withdraw consent
- **Audit**: Consent audit trails

### Privacy by Design

#### 1. **Default Privacy**
- **Default Settings**: Privacy-first defaults
- **Opt-in**: Explicit opt-in for data sharing
- **Minimal Collection**: Only necessary data
- **Anonymization**: Data anonymization

#### 2. **Privacy Controls**
- **Data Portability**: Export user data
- **Data Deletion**: Right to be forgotten
- **Access Control**: Granular access controls
- **Audit Logs**: Privacy audit trails

---

## Compliance

### Standards Compliance

#### 1. **W3C DID Core**
- **Status**: Fully compliant
- **Version**: 1.0
- **URL**: https://www.w3.org/TR/did-core/

#### 2. **DIF DID Resolution**
- **Status**: Fully compliant
- **Version**: 1.0
- **URL**: https://identity.foundation/did-resolution/

#### 3. **W3C Verifiable Credentials**
- **Status**: Compatible
- **Version**: 2.0
- **URL**: https://www.w3.org/TR/vc-data-model/

### Regulatory Compliance

#### 1. **GDPR Compliance**
- **Data Protection**: Article 5
- **User Rights**: Articles 12-22
- **Consent**: Article 7
- **Security**: Article 32

#### 2. **CCPA Compliance**
- **Data Rights**: Section 1798.100
- **Disclosure**: Section 1798.110
- **Deletion**: Section 1798.105
- **Non-Discrimination**: Section 1798.125

#### 3. **SOC 2 Compliance**
- **Security**: CC6.1-CC6.8
- **Availability**: CC7.1-CC7.5
- **Processing Integrity**: CC8.1-CC8.4
- **Confidentiality**: CC9.1-CC9.4

### Certification

#### 1. **Security Certifications**
- **ISO 27001**: Information Security Management
- **FIPS 140-2**: Cryptographic Module Validation
- **Common Criteria**: Security Evaluation

#### 2. **Privacy Certifications**
- **ISO 27701**: Privacy Information Management
- **TRUSTe**: Privacy Certification
- **EU-US Privacy Shield**: Data Transfer

---

## Implementation Guide

### DID Creation

#### 1. **Generate Identifier**
```javascript
const identifier = await generateCryptographicIdentifier();
// Result: "123456789abcdef"
```

#### 2. **Create DID**
```javascript
const did = `did:identity:${identifier}`;
// Result: "did:identity:123456789abcdef"
```

#### 3. **Generate Keys**
```javascript
const keyPair = await crypto.subtle.generateKey(
  {
    name: 'Ed25519',
    namedCurve: 'Ed25519'
  },
  true,
  ['sign', 'verify']
);
```

#### 4. **Create DID Document**
```javascript
const didDocument = {
  "@context": ["https://www.w3.org/ns/did/v1"],
  "id": did,
  "verificationMethod": [{
    "id": `${did}#keys-1`,
    "type": "Ed25519VerificationKey2020",
    "controller": did,
    "publicKeyMultibase": await encodePublicKey(keyPair.publicKey)
  }],
  "authentication": [`${did}#keys-1`],
  "assertionMethod": [`${did}#keys-1`]
};
```

### DID Resolution

#### 1. **Parse DID**
```javascript
const parsed = parseDID(did);
// Result: { method: "identity", identifier: "123456789abcdef" }
```

#### 2. **Resolve DID Document**
```javascript
const resolution = await resolveDID(did);
// Result: DID resolution response
```

#### 3. **Validate DID Document**
```javascript
const isValid = validateDIDDocument(resolution.didDocument);
// Result: boolean
```

### DID Authentication

#### 1. **Generate Challenge**
```javascript
const challenge = await generateChallenge(did);
// Result: { challenge: "random-string", expiresAt: "2024-01-01T00:05:00Z" }
```

#### 2. **Sign Challenge**
```javascript
const signature = await signChallenge(challenge.challenge, privateKey);
// Result: base64-encoded signature
```

#### 3. **Verify Authentication**
```javascript
const isValid = await verifyAuthentication(did, challenge.challenge, signature);
// Result: boolean
```

---

## Testing

### Conformance Testing

#### 1. **DID Syntax Testing**
```javascript
const testCases = [
  "did:identity:123456789abcdef", // Valid
  "did:identity:invalid", // Invalid
  "did:other:123456789abcdef", // Invalid method
  "did:identity:", // Missing identifier
];

testCases.forEach(did => {
  const isValid = validateDIDSyntax(did);
  console.log(`${did}: ${isValid}`);
});
```

#### 2. **DID Document Testing**
```javascript
const testDocument = {
  "@context": ["https://www.w3.org/ns/did/v1"],
  "id": "did:identity:123456789abcdef",
  "verificationMethod": [...],
  "authentication": [...]
};

const validation = validateDIDDocument(testDocument);
console.log("Validation result:", validation);
```

#### 3. **Authentication Testing**
```javascript
const testAuthentication = async () => {
  const did = "did:identity:123456789abcdef";
  const challenge = await generateChallenge(did);
  const signature = await signChallenge(challenge.challenge, privateKey);
  const isValid = await verifyAuthentication(did, challenge.challenge, signature);
  
  console.log("Authentication test:", isValid);
};
```

### Interoperability Testing

#### 1. **Cross-Platform Testing**
- Test with different DID implementations
- Verify resolution compatibility
- Check authentication interoperability

#### 2. **Standard Compliance Testing**
- W3C DID Core compliance
- DIF DID Resolution compliance
- Verifiable Credentials compatibility

---

## References

### Standards
- [W3C DID Core](https://www.w3.org/TR/did-core/)
- [DIF DID Resolution](https://identity.foundation/did-resolution/)
- [W3C Verifiable Credentials](https://www.w3.org/TR/vc-data-model/)

### Implementations
- [Identity Protocol Implementation](https://github.com/your-org/identity-protocol)
- [DID Method Registry](https://w3c-ccg.github.io/did-method-registry/)

### Tools
- [DID Resolver](https://github.com/decentralized-identity/did-resolver)
- [DID Core Test Suite](https://github.com/w3c/did-test-suite)

---

*This specification is maintained by the Standards Team and updated regularly.*
*Last updated: $(date +'%Y-%m-%d')*
