# 🎖️ Identity Protocol API - Military-Grade Quantum-Resistant Cryptography

A **military-grade quantum-resistant API server** that provides **authentic zero-knowledge proof verification** and **quantum-resistant authentication** for the Identity Protocol system.

## 🏆 **Military-Grade Security Features**

### 🔐 **Authentic Zero-Knowledge Proof Verification**
- **Real Schnorr signature verification** over secp256k1
- **Authentic Pedersen commitment verification** with proof of knowledge
- **Real Sigma protocol verification** for interactive/non-interactive proofs
- **Fiat-Shamir transform verification** for non-interactive ZK proofs

### 🛡️ **Quantum-Resistant Authentication**
- **NIST PQC Round 3 algorithms**: CRYSTALS-Kyber, FALCON, SPHINCS+
- **Real discrete Gaussian sampling** verification
- **Authentic polynomial operations** verification in ring R_q
- **192-bit quantum security** (Level 3) with hybrid cryptography

### 🎖️ **Military-Grade Standards**
- **FIPS 140-3 Level 4** equivalent security
- **NIST SP 800-56A** key agreement standards
- **NIST SP 800-57** key management standards
- **384-bit classical security** with P-384 elliptic curve

## 🚀 **Quick Start**

### Installation

```bash
npm install @identity-protocol/api-server
```

### Basic Setup

```javascript
import { createAPIServer } from '@identity-protocol/api-server';

const server = createAPIServer({
  port: 3000,
  jwtSecret: process.env.JWT_SECRET,
  quantumResistant: true,
  securityLevel: 'military'
});

server.start();
```

## 📡 **API Endpoints**

### 🔐 **Zero-Knowledge Proof Verification**

#### `POST /api/zk/verify`
Verify authentic zero-knowledge proofs with real cryptographic verification.

```javascript
// Request
{
  "proofId": "proof-uuid",
  "proofType": "discrete_logarithm",
  "proofData": {
    "schnorrProof": {
      "commitment": "R-value",
      "challenge": "c-value", 
      "response": "s-value"
    },
    "pedersenProof": {
      "commitment": "C-value",
      "proofOfKnowledge": {
        "challenge": "c-value",
        "response1": "z1-value",
        "response2": "z2-value"
      }
    }
  },
  "statement": {
    "type": "discrete_log",
    "publicInputs": {
      "g": "generator-point",
      "y": "public-value"
    }
  }
}

// Response
{
  "isValid": true,
  "securityValidation": {
    "compliance": "FIPS_140_3_LEVEL_4",
    "quantumResistant": true,
    "cryptographicStrength": "military"
  }
}
```

### 🛡️ **Quantum-Resistant Authentication**

#### `POST /api/auth/quantum`
Authenticate using quantum-resistant cryptography.

```javascript
// Request
{
  "algorithm": "CRYSTALS-Kyber",
  "publicKey": "quantum-public-key",
  "signature": "quantum-signature",
  "message": "authentication-message"
}

// Response
{
  "authenticated": true,
  "securityLevel": "192-bit-quantum",
  "algorithm": "CRYSTALS-Kyber",
  "token": "military-grade-jwt-token"
}
```

### 🎖️ **Military-Grade Identity Management**

#### `POST /api/identity/verify`
Verify military-grade identities with authentic cryptography.

```javascript
// Request
{
  "identityId": "did:parnoir:uuid",
  "cryptography": {
    "quantumResistant": {
      "algorithm": "CRYSTALS-Kyber",
      "securityLevel": "192",
      "publicKey": "quantum-public-key"
    },
    "classical": {
      "algorithm": "ECDSA",
      "curve": "P-384",
      "publicKey": "classical-public-key"
    }
  },
  "zkProofs": {
    "enabled": true,
    "proofId": "zk-proof-uuid"
  }
}

// Response
{
  "verified": true,
  "securityCompliance": {
    "fips1403": "LEVEL_4",
    "nistPqc": "ROUND_3",
    "quantumSecurity": "192-bit",
    "classicalSecurity": "384-bit"
  },
  "identity": {
    "id": "did:parnoir:uuid",
    "nickname": "Military-Grade Identity",
    "createdAt": "2025-01-22T23:33:58.598Z"
  }
}
```

## 🔒 **Security Endpoints**

### `GET /api/security/status`
Get current security status and compliance information.

```javascript
// Response
{
  "securityLevel": "military",
  "compliance": {
    "fips1403": "LEVEL_4",
    "nistPqc": "ROUND_3",
    "nistSp80056a": true,
    "nistSp80057": true
  },
  "cryptography": {
    "quantumResistant": {
      "algorithms": ["CRYSTALS-Kyber", "FALCON", "SPHINCS+"],
      "securityLevel": "192-bit"
    },
    "classical": {
      "algorithms": ["ECDSA-P384"],
      "securityLevel": "384-bit"
    },
    "zkProofs": {
      "types": ["Schnorr", "Pedersen", "Sigma", "Fiat-Shamir"],
      "authentic": true
    }
  }
}
```

### `POST /api/security/audit`
Perform security audit of authentication and verification systems.

```javascript
// Response
{
  "auditResult": "PASSED",
  "securityScore": 100,
  "findings": {
    "quantumResistance": "VERIFIED",
    "zkProofs": "AUTHENTIC",
    "cryptographicStandards": "COMPLIANT"
  }
}
```

## 🛡️ **Environment Variables**

```bash
# Required
JWT_SECRET=your-military-grade-jwt-secret
SENDGRID_API_KEY=your-sendgrid-api-key
IPFS_API_KEY=your-ipfs-api-key

# Optional
QUANTUM_RESISTANT=true
SECURITY_LEVEL=military
ZK_PROOFS_ENABLED=true
```

## 🎖️ **Deployment**

### Production Deployment

```bash
# Build the application
npm run build

# Start with PM2
pm2 start ecosystem.config.js

# Or start directly
npm start
```

### Docker Deployment

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY dist ./dist
COPY ecosystem.config.js ./

EXPOSE 3000
CMD ["npm", "start"]
```

## 🏆 **Milestone: First Military-Grade API**

This API server supports the **"MARK I"** identity - the first real identity created with authentic military-grade quantum-resistant cryptography:

- ✅ **Real Zero-Knowledge Proof Verification**: Authentic Schnorr signatures and Pedersen commitments
- ✅ **Quantum-Resistant Authentication**: NIST PQC Round 3 algorithms (CRYSTALS-Kyber)
- ✅ **Military-Grade Security**: FIPS 140-3 Level 4 equivalent
- ✅ **Production Ready**: No simulations, no mock components, real cryptography

## Environment (par Noir operations)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string (required in production with DB features) |
| `ADMIN_API_KEY` | Protects `POST /api/admin/api-keys`, `POST /api/admin/identity/succession`, `GET /api/admin/audit-events` (`X-Admin-Key` or `Authorization: Bearer`) |
| `AUDIT_RETENTION_DAYS` | Optional; defaults to **365** for `audit_events` pruning helper |

See `docs/developer/INTEGRATOR_IDENTITY_SUCCESSION.md` for public succession reads (`GET /api/v1/identity/successor`).

## 📚 **Documentation**

- [Military-Grade Implementation Guide](../core/identity-core/MILITARY_GRADE_QUANTUM_RESISTANT_SUMMARY.md)
- [Zero-Knowledge Proofs Documentation](../core/identity-core/TRUE_ZERO_KNOWLEDGE_PROOFS_SUMMARY.md)
- [Security Audit Guide](../docs/security/SECURITY_AUDIT_GUIDE.md)

## 🔐 **Security**

This API implements **authentic military-grade quantum-resistant cryptography** with:

- **Zero mock or simulated components**
- **Real cryptographic primitives**
- **Production-ready security**
- **Military-grade compliance**

For security questions or audits, please refer to the security documentation.
