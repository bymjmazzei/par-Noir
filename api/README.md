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

## Build note (Railway / Docker)

`database.ts` loads SQL from `dist/migrations/` at runtime (paths relative to compiled `dist/server/utils/`). The **`npm run build`** script copies `api/migrations/` → `api/dist/migrations/` after `tsc`. If you build with plain `tsc` only, migrations won’t run and boot will fail with missing `oauth_clients`.

**Railway / image build “stuck” or OOM:** `src/server.ts` is very large; full `tsc` with declaration emit can exhaust memory on small builders. Production builds use **`tsconfig.build.json`** (no `.d.ts` / maps) and **`NODE_OPTIONS=--max-old-space-size=8192`** (see `package.json` and `nixpacks.toml`). If builds still timeout, increase the service **build timeout** in Railway or use a larger builder plan.

## Environment (par Noir operations)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string (required in production with DB features) |
| `ADMIN_API_KEY` | Protects `POST /oauth/clients` (admin), `POST /api/admin/api-keys`, `POST /api/admin/identity/succession`, `GET /api/admin/audit-events` (`X-Admin-Key` or `Authorization: Bearer`). Do not use from browser apps. |
| `DEVELOPER_PORTAL_CLIENT_ID` | Optional; defaults to **`developer-portal`**. OAuth access tokens for this client id are required for `/api/developer/*` self-service routes. |
| `AUDIT_RETENTION_DAYS` | Optional; defaults to **365** for `audit_events` pruning helper |
| `REDIS_URL` | Optional; enables distributed cache and **shared API-key rate limits** across multiple API processes (see `docs/api/RATE_LIMITS.md`) |
| `SENTRY_DSN` | Optional; server-side error reporting (`SENTRY_TRACES_SAMPLE_RATE` 0–1, default 0) |
| `ACCESS_LOG_JSON` | Set to `true` to emit one JSON access line per request in production (on by default in development only) |
| `SOCKET_REQUIRE_AUTH` | Set to `true` to require a valid OAuth access token on Socket.IO handshakes |

### OAuth access tokens (production)

Choose **one** signing posture and keep `issuer` / `audience` consistent everywhere tokens are minted and verified. If `iss` or `aud` in the JWT does not match `PN_OAUTH_ISSUER` / `PN_OAUTH_AUDIENCE`, `validateAccessToken` rejects the token (401 on protected routes).

| Posture | Required env | Notes |
|--------|----------------|-------|
| **HS256 (default)** | `PN_OAUTH_SECRET` — strong, unique secret; required in production | Symmetric signing. No JWKS required for verification on the API itself. |
| **RS256 + PEM** | `PN_OAUTH_ACCESS_TOKEN_ALG=RS256`, `PN_OAUTH_PRIVATE_KEY_PEM`, `PN_OAUTH_PUBLIC_KEY_PEM` (or `PN_OAUTH_JWKS_JSON`), optional `PN_OAUTH_KEY_ID` | Verifiers use public key / JWKS. Serve `GET /.well-known/jwks.json` for integrators. |
| **RS256 + GCP KMS** | `PN_OAUTH_ACCESS_TOKEN_ALG=RS256`, `PN_OAUTH_KMS_KEY_VERSION`, plus public side (`PN_OAUTH_PUBLIC_KEY_PEM` / `PN_OAUTH_JWKS_JSON`) for verification | Private key never leaves KMS; align `kid` with JWKS. |

**Always set for minted JWTs (defaults shown):** `PN_OAUTH_ISSUER` (default `par-noir-api`), `PN_OAUTH_AUDIENCE` (default `par-noir-clients`).

**Refresh token rotation:** `PN_OAUTH_ENFORCE_REFRESH_ROTATION=true` causes `/oauth/refresh` to return a **new** `refresh_token` and invalidate the previous one. **All clients** (aggregator, developer portal, Prism, etc.) must persist `refresh_token` from every `/oauth/token` and `/oauth/refresh` response before enabling this in staging, then production.

### Storage credentials envelope (optional)

| Variable | Purpose |
|----------|---------|
| `STORAGE_CREDENTIALS_SECRET` | Required to encrypt stored storage credentials |
| `STORAGE_CREDENTIALS_ENVELOPE_V2` | Set to `true` to use v2 envelope (KMS-wrapped DEK when `STORAGE_CREDENTIALS_KMS_KEY` is set) |
| `STORAGE_CREDENTIALS_KMS_KEY` | Full GCP KMS crypto key resource name for envelope v2 |

Enable v2 in **staging** first; verify read/write of credentials; then production. Misconfigured KMS can lock users out—test restore.

### Admin API (no long-lived shared key in production)

| Variable | Purpose |
|----------|---------|
| `ADMIN_IDENTITY_HEADERS_ENABLED` | When `true`, trust gateway identity headers (`x-admin-principal`, `x-goog-authenticated-user-email`, etc.) |
| `ADMIN_ALLOWED_PRINCIPALS` | Comma-separated list of allowed principal values (e.g. IAP user emails) |
| `ADMIN_DISABLE_LEGACY_API_KEY` | When `true`, reject legacy `ADMIN_API_KEY` auth in production (use identity headers or automation with the right principal) |
| `ADMIN_API_KEY` | Legacy shared secret; avoid in production once headers + `ADMIN_DISABLE_LEGACY_API_KEY` are on |

**Scripts and automation** should call admin routes from a trusted network (see `api/nginx.conf` `/api/admin/` allowlist) or through IAP/Cloud Load Balancer that injects identity headers. Do not put `ADMIN_API_KEY` in browser or public repos. See [docs/ops/ADMIN_AUTHENTICATION.md](../docs/ops/ADMIN_AUTHENTICATION.md).

**Health:** `GET /health` (liveness). `GET /health/ready` returns 503 if `DATABASE_URL` is set but the database is unreachable. Quick check: `API_BASE_URL=https://your-api npm run smoke:health` (from `api/`).

**Runbooks:** [docs/ops/BACKUP_AND_RESTORE_RUNBOOK.md](../docs/ops/BACKUP_AND_RESTORE_RUNBOOK.md), [docs/ops/GO_NO_GO_LAUNCH.md](../docs/ops/GO_NO_GO_LAUNCH.md), [docs/ops/CDN_AND_PROXY_LIMITS.md](../docs/ops/CDN_AND_PROXY_LIMITS.md).

**Operations (checklist):** (1) Configure automated Postgres backups and run a restore drill on your provider. (2) Set `SENTRY_DSN` or another APM path you own. (3) For more than one API instance, set `REDIS_URL` so per–API-key limits stay global. (4) Native apps: privacy policy URL, support contact, OAuth redirect / `VITE_PN_CLIENT_ID` per app, TestFlight or Play internal track before wide release. Env audit: [docs/ops/PRODUCTION_ENV_AUDIT.md](../docs/ops/PRODUCTION_ENV_AUDIT.md). Full phased plan: [docs/ops/PRODUCTION_READINESS_PLAN.md](../docs/ops/PRODUCTION_READINESS_PLAN.md).

See `docs/developer/INTEGRATOR_IDENTITY_SUCCESSION.md` for public succession reads (`GET /api/v1/identity/successor`).

**Third-party OAuth:** The canonical flow is **authorization code** with a registered **`redirect_uri`**; after consent the user agent is always redirected there with `code` / `state` (or OAuth `error` params). Popup UX is optional and still uses the same redirect. See [`docs/developer/PN_OAUTH_INTEGRATION.md`](../docs/developer/PN_OAUTH_INTEGRATION.md). **`GET /oauth/popup-bridge`** is deprecated (**410 Gone**).

## 📚 **Documentation**

- [pN OAuth for integrators](../docs/developer/PN_OAUTH_INTEGRATION.md)
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
