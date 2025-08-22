# Identity Protocol - Developer Guide

**Welcome Developers!** This guide will help you integrate Identity Protocol into your applications and understand the development ecosystem.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Architecture Overview](#architecture-overview)
3. [SDK Integration](#sdk-integration)
4. [API Reference](#api-reference)
5. [Security Best Practices](#security-best-practices)
6. [Testing & Debugging](#testing--debugging)
7. [Deployment](#deployment)
8. [Contributing](#contributing)

---

## Getting Started

### Prerequisites

**Required Knowledge**:
- JavaScript/TypeScript (intermediate)
- Web APIs and HTTP
- Basic cryptography concepts
- RESTful API design
- Modern web development practices

**Development Environment**:
- Node.js 18+ and npm
- Modern web browser (Chrome, Firefox, Safari, Edge)
- Code editor (VS Code recommended)
- Git for version control

**System Requirements**:
- 4GB RAM minimum, 8GB recommended
- 2GB free disk space
- Stable internet connection

### Quick Start

**1. Install the SDK**:
```bash
npm install @identity-protocol/sdk
```

**2. Basic Integration**:
```typescript
import { IdentityProtocolAPI } from '@identity-protocol/sdk';

const api = new IdentityProtocolAPI({
  baseURL: 'https://api.identity-protocol.com/v1',
  apiKey: 'your-api-key'
});

// Create a user identity
const identity = await api.identities.create({
  username: 'testuser',
  passcode: 'MySecurePass123!@#'
});

console.log('Identity created:', identity.id);
```

**3. Authentication Flow**:
```typescript
// Authenticate user
const auth = await api.auth.login({
  username: 'testuser',
  passcode: 'MySecurePass123!@#'
});

// Use the token for subsequent requests
api.setToken(auth.token);

// Get user profile
const profile = await api.identities.getProfile();
```

### Development Setup

**1. Clone the Repository**:
```bash
git clone https://github.com/identity-protocol/identity-protocol.git
cd identity-protocol
```

**2. Install Dependencies**:
```bash
npm install
```

**3. Set Up Environment**:
```bash
cp .env.example .env
# Edit .env with your configuration
```

**4. Start Development Server**:
```bash
npm run dev
```

**5. Run Tests**:
```bash
npm test
```

---

## Architecture Overview

### Core Components

**Identity Core** (`core/identity-core/`):
- Cryptographic operations
- DID management
- Storage layer
- Security utilities

**API Server** (`api/`):
- RESTful API endpoints
- Authentication middleware
- Rate limiting
- Error handling

**Dashboard App** (`apps/id-dashboard/`):
- User interface
- PWA capabilities
- Offline functionality
- Real-time updates

**Browser Tools** (`browser/`):
- Content aggregation
- Domain registry
- Social networking
- Monetization tools

### Data Flow

```
User Request → API Gateway → Authentication → Business Logic → Storage → Response
     ↓              ↓              ↓              ↓              ↓
  Frontend    Rate Limiting   JWT Validation   Core Services   IndexedDB
```

### Security Architecture

**Multi-Layer Security**:
1. **Transport Layer**: HTTPS/TLS 1.3
2. **Application Layer**: JWT authentication
3. **Data Layer**: AES-256-GCM encryption
4. **Storage Layer**: Encrypted local storage
5. **Hardware Layer**: HSM integration (optional)

**Cryptographic Stack**:
- **Hashing**: SHA-512
- **Encryption**: AES-256-GCM
- **Signatures**: ECDSA-P384
- **Key Derivation**: PBKDF2
- **Random Generation**: Crypto.getRandomValues()

---

## SDK Integration

### Installation

**NPM Package**:
```bash
npm install @identity-protocol/sdk
```

**CDN (Browser)**:
```html
<script src="https://cdn.identity-protocol.com/sdk/latest/identity-protocol.min.js"></script>
```

**TypeScript Types**:
```bash
npm install @types/identity-protocol
```

### Basic Usage

**Initialize the SDK**:
```typescript
import { IdentityProtocolAPI } from '@identity-protocol/sdk';

const api = new IdentityProtocolAPI({
  baseURL: 'https://api.identity-protocol.com/v1',
  apiKey: 'your-api-key',
  timeout: 30000,
  retries: 3
});
```

**Configuration Options**:
```typescript
interface Config {
  baseURL: string;
  apiKey?: string;
  token?: string;
  timeout?: number;
  retries?: number;
  debug?: boolean;
  userAgent?: string;
}
```

### Identity Management

**Create Identity**:
```typescript
const identity = await api.identities.create({
  username: 'developer123',
  passcode: 'MySecurePass123!@#',
  displayName: 'Developer Account',
  email: 'dev@example.com',
  preferences: {
    privacy: 'medium',
    sharing: 'selective',
    notifications: true,
    backup: true
  }
});
```

**Authenticate Identity**:
```typescript
const auth = await api.auth.login({
  username: 'developer123',
  passcode: 'MySecurePass123!@#'
});

// Set token for subsequent requests
api.setToken(auth.token);
```

**Update Identity**:
```typescript
const updated = await api.identities.update(identity.id, {
  displayName: 'Updated Developer Account',
  preferences: {
    privacy: 'high',
    sharing: 'private'
  }
});
```

**Delete Identity**:
```typescript
await api.identities.delete(identity.id);
```

### Tool Integration

**Grant Tool Access**:
```typescript
const access = await api.tools.grantAccess({
  toolId: 'browser-tool',
  identityId: identity.id,
  permissions: ['read', 'write'],
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
});
```

**Check Tool Permissions**:
```typescript
const permissions = await api.tools.getPermissions({
  toolId: 'browser-tool',
  identityId: identity.id
});

if (permissions.canRead) {
  // Perform read operation
}
```

**Revoke Tool Access**:
```typescript
await api.tools.revokeAccess({
  toolId: 'browser-tool',
  identityId: identity.id
});
```

### Error Handling

**Try-Catch Pattern**:
```typescript
try {
  const identity = await api.identities.create({
    username: 'testuser',
    passcode: 'MySecurePass123!@#'
  });
} catch (error) {
  if (error.code === 'VALIDATION_ERROR') {
    console.error('Invalid input:', error.message);
  } else if (error.code === 'CONFLICT') {
    console.error('Username already exists');
  } else {
    console.error('Unexpected error:', error);
  }
}
```

**Error Types**:
```typescript
interface APIError {
  code: string;
  message: string;
  details?: any;
  timestamp: string;
  requestId?: string;
}
```

### Event Handling

**Listen for Events**:
```typescript
api.on('identity.created', (data) => {
  console.log('New identity created:', data);
});

api.on('auth.login', (data) => {
  console.log('User logged in:', data);
});

api.on('error', (error) => {
  console.error('API Error:', error);
});
```

**Available Events**:
- `identity.created`
- `identity.updated`
- `identity.deleted`
- `auth.login`
- `auth.logout`
- `tool.access.granted`
- `tool.access.revoked`
- `error`

---

## API Reference

### Authentication Endpoints

**POST /auth/login**
```typescript
const auth = await api.auth.login({
  username: string,
  passcode: string
});
```

**POST /auth/logout**
```typescript
await api.auth.logout();
```

**POST /auth/refresh**
```typescript
const newToken = await api.auth.refresh(refreshToken);
```

### Identity Endpoints

**POST /identities**
```typescript
const identity = await api.identities.create({
  username: string,
  passcode: string,
  displayName?: string,
  email?: string,
  preferences?: IdentityPreferences
});
```

**GET /identities/{id}**
```typescript
const identity = await api.identities.get(identityId);
```

**PUT /identities/{id}**
```typescript
const updated = await api.identities.update(identityId, {
  displayName?: string,
  email?: string,
  preferences?: IdentityPreferences
});
```

**DELETE /identities/{id}**
```typescript
await api.identities.delete(identityId);
```

### Tool Endpoints

**POST /tools/{toolId}/access**
```typescript
const access = await api.tools.grantAccess({
  toolId: string,
  identityId: string,
  permissions: string[],
  expiresAt?: string
});
```

**GET /tools/{toolId}/access/{identityId}**
```typescript
const permissions = await api.tools.getPermissions({
  toolId: string,
  identityId: string
});
```

**DELETE /tools/{toolId}/access/{identityId}**
```typescript
await api.tools.revokeAccess({
  toolId: string,
  identityId: string
});
```

### Response Types

**Identity Type**:
```typescript
interface Identity {
  id: string;
  username: string;
  displayName?: string;
  email?: string;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'inactive' | 'suspended';
  preferences: IdentityPreferences;
  permissions: Record<string, ToolPermission>;
}
```

**Authentication Response**:
```typescript
interface AuthResponse {
  token: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: string;
    username: string;
    displayName?: string;
  };
}
```

**Tool Permission**:
```typescript
interface ToolPermission {
  granted: boolean;
  grantedAt: string;
  expiresAt?: string;
  permissions: string[];
}
```

---

## Security Best Practices

### API Security

**1. Secure API Keys**:
```typescript
// Store API keys securely
const apiKey = process.env.IDENTITY_PROTOCOL_API_KEY;
const api = new IdentityProtocolAPI({ apiKey });
```

**2. Token Management**:
```typescript
// Store tokens securely
const token = localStorage.getItem('auth_token');
api.setToken(token);

// Refresh tokens before expiration
setInterval(async () => {
  try {
    const newToken = await api.auth.refresh(refreshToken);
    api.setToken(newToken);
  } catch (error) {
    // Handle refresh failure
  }
}, 5 * 60 * 1000); // 5 minutes
```

**3. Input Validation**:
```typescript
import { validateUsername, validatePasscode } from '@identity-protocol/sdk';

const username = validateUsername(inputUsername);
const passcode = validatePasscode(inputPasscode);

if (!username.isValid) {
  throw new Error(username.errors.join(', '));
}
```

### Data Protection

**1. Encrypt Sensitive Data**:
```typescript
import { CryptoManager } from '@identity-protocol/sdk';

const encrypted = await CryptoManager.encrypt(
  sensitiveData,
  userPasscode
);
```

**2. Secure Storage**:
```typescript
// Use secure storage for sensitive data
const secureStorage = {
  set: (key: string, value: string) => {
    // Use encrypted storage
    localStorage.setItem(key, encrypt(value));
  },
  get: (key: string) => {
    const encrypted = localStorage.getItem(key);
    return encrypted ? decrypt(encrypted) : null;
  }
};
```

**3. Data Minimization**:
```typescript
// Only collect necessary data
const minimalData = {
  username: user.username,
  displayName: user.displayName
  // Don't collect unnecessary fields
};
```

### Error Handling

**1. Don't Expose Sensitive Information**:
```typescript
try {
  await api.auth.login(credentials);
} catch (error) {
  // Log error internally
  logger.error('Login failed:', error);
  
  // Return generic error to user
  throw new Error('Authentication failed. Please try again.');
}
```

**2. Validate All Inputs**:
```typescript
const validateInput = (input: any) => {
  if (typeof input !== 'string') {
    throw new Error('Invalid input type');
  }
  
  if (input.length > 1000) {
    throw new Error('Input too long');
  }
  
  // Sanitize input
  return input.replace(/[<>]/g, '');
};
```

### Rate Limiting

**1. Implement Client-Side Rate Limiting**:
```typescript
class RateLimiter {
  private requests: number[] = [];
  private limit: number;
  private window: number;
  
  constructor(limit: number, window: number) {
    this.limit = limit;
    this.window = window;
  }
  
  canMakeRequest(): boolean {
    const now = Date.now();
    this.requests = this.requests.filter(
      time => now - time < this.window
    );
    
    if (this.requests.length >= this.limit) {
      return false;
    }
    
    this.requests.push(now);
    return true;
  }
}

const limiter = new RateLimiter(100, 15 * 60 * 1000); // 100 requests per 15 minutes
```

**2. Handle Rate Limit Responses**:
```typescript
try {
  const result = await api.someEndpoint();
} catch (error) {
  if (error.code === 'RATE_LIMIT_EXCEEDED') {
    const retryAfter = error.headers['retry-after'];
    setTimeout(() => {
      // Retry request
    }, retryAfter * 1000);
  }
}
```

---

## Testing & Debugging

### Unit Testing

**Setup Jest Configuration**:
```javascript
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/__tests__/**'
  ]
};
```

**Test Identity Creation**:
```typescript
import { IdentityProtocolAPI } from '@identity-protocol/sdk';

describe('Identity Management', () => {
  let api: IdentityProtocolAPI;
  
  beforeEach(() => {
    api = new IdentityProtocolAPI({
      baseURL: 'http://localhost:3002',
      apiKey: 'test-api-key'
    });
  });
  
  it('should create identity successfully', async () => {
    const identity = await api.identities.create({
      username: 'testuser',
      passcode: 'MySecurePass123!@#'
    });
    
    expect(identity.username).toBe('testuser');
    expect(identity.status).toBe('active');
  });
  
  it('should reject weak passcodes', async () => {
    await expect(
      api.identities.create({
        username: 'testuser',
        passcode: 'weak'
      })
    ).rejects.toThrow('Weak passcode');
  });
});
```

**Test Authentication**:
```typescript
describe('Authentication', () => {
  it('should authenticate with valid credentials', async () => {
    const auth = await api.auth.login({
      username: 'testuser',
      passcode: 'MySecurePass123!@#'
    });
    
    expect(auth.token).toBeDefined();
    expect(auth.user.username).toBe('testuser');
  });
  
  it('should reject invalid credentials', async () => {
    await expect(
      api.auth.login({
        username: 'testuser',
        passcode: 'wrongpass'
      })
    ).rejects.toThrow('Invalid credentials');
  });
});
```

### Integration Testing

**Setup Test Environment**:
```typescript
// test-setup.ts
import { setupTestDatabase } from './test-utils';

beforeAll(async () => {
  await setupTestDatabase();
});

afterAll(async () => {
  await cleanupTestDatabase();
});
```

**Test API Endpoints**:
```typescript
import request from 'supertest';
import { app } from '../src/app';

describe('API Endpoints', () => {
  it('should create identity via API', async () => {
    const response = await request(app)
      .post('/api/identities')
      .send({
        username: 'apitest',
        passcode: 'MySecurePass123!@#'
      })
      .expect(201);
    
    expect(response.body.success).toBe(true);
    expect(response.body.data.username).toBe('apitest');
  });
});
```

### Debugging

**Enable Debug Mode**:
```typescript
const api = new IdentityProtocolAPI({
  baseURL: 'https://api.identity-protocol.com/v1',
  debug: true // Enable debug logging
});
```

**Debug Logs**:
```typescript
// Debug information includes:
// - Request/response details
// - Timing information
// - Error stack traces
// - API call sequences
```

**Browser DevTools**:
```typescript
// Monitor network requests
// Check console for errors
// Use breakpoints for debugging
// Inspect localStorage for data
```

**Error Tracking**:
```typescript
import { ErrorTracker } from '@identity-protocol/sdk';

ErrorTracker.init({
  dsn: 'your-sentry-dsn',
  environment: 'development'
});

// Errors are automatically tracked
```

---

## Deployment

### Production Checklist

**Security**:
- [ ] Use HTTPS in production
- [ ] Set secure environment variables
- [ ] Enable rate limiting
- [ ] Configure CORS properly
- [ ] Set up monitoring and alerting
- [ ] Enable security headers
- [ ] Use secure session management

**Performance**:
- [ ] Enable compression
- [ ] Set up caching
- [ ] Optimize database queries
- [ ] Use CDN for static assets
- [ ] Monitor performance metrics
- [ ] Set up load balancing

**Reliability**:
- [ ] Set up automated backups
- [ ] Configure health checks
- [ ] Set up logging and monitoring
- [ ] Plan disaster recovery
- [ ] Test failover procedures

### Environment Configuration

**Production Environment**:
```bash
# .env.production
NODE_ENV=production
PORT=3002
DATABASE_URL=postgresql://user:pass@host:port/db
REDIS_URL=redis://host:port
JWT_SECRET=your-super-secret-jwt-key
ENCRYPTION_KEY=your-encryption-key
API_RATE_LIMIT=100
CORS_ORIGIN=https://yourdomain.com
```

**Docker Deployment**:
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3002

CMD ["npm", "start"]
```

**Docker Compose**:
```yaml
version: '3.8'
services:
  api:
    build: .
    ports:
      - "3002:3002"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://user:pass@db:5432/identity
    depends_on:
      - db
      - redis
  
  db:
    image: postgres:15
    environment:
      - POSTGRES_DB=identity
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
    volumes:
      - postgres_data:/var/lib/postgresql/data
  
  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

### Monitoring

**Health Checks**:
```typescript
// health-check.ts
import { HealthChecker } from '@identity-protocol/sdk';

const healthChecker = new HealthChecker({
  checks: [
    { name: 'database', check: checkDatabase },
    { name: 'redis', check: checkRedis },
    { name: 'encryption', check: checkEncryption }
  ]
});

app.get('/health', async (req, res) => {
  const health = await healthChecker.check();
  res.json(health);
});
```

**Performance Monitoring**:
```typescript
import { PerformanceMonitor } from '@identity-protocol/sdk';

PerformanceMonitor.onMetric((metric) => {
  // Send to monitoring service
  monitoringService.record(metric);
});
```

**Error Monitoring**:
```typescript
import { ErrorTracker } from '@identity-protocol/sdk';

ErrorTracker.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV
});
```

---

## Contributing

### Development Workflow

**1. Fork the Repository**:
```bash
git clone https://github.com/your-username/identity-protocol.git
cd identity-protocol
```

**2. Create Feature Branch**:
```bash
git checkout -b feature/your-feature-name
```

**3. Make Changes**:
- Write code following style guidelines
- Add tests for new functionality
- Update documentation
- Ensure all tests pass

**4. Submit Pull Request**:
- Create detailed description
- Link related issues
- Request code review
- Address feedback

### Code Style

**TypeScript Guidelines**:
```typescript
// Use strict typing
interface User {
  id: string;
  username: string;
  email?: string;
}

// Use async/await
async function getUser(id: string): Promise<User> {
  const response = await api.get(`/users/${id}`);
  return response.data;
}

// Use proper error handling
try {
  const user = await getUser('123');
} catch (error) {
  logger.error('Failed to get user:', error);
  throw new Error('User not found');
}
```

**Testing Guidelines**:
```typescript
// Write descriptive test names
describe('User Authentication', () => {
  it('should authenticate user with valid credentials', async () => {
    // Test implementation
  });
  
  it('should reject invalid credentials', async () => {
    // Test implementation
  });
});
```

### Documentation

**Code Comments**:
```typescript
/**
 * Creates a new user identity with the provided credentials
 * @param username - Unique username for the identity
 * @param passcode - Strong passcode for authentication
 * @returns Promise resolving to the created identity
 * @throws {ValidationError} When input validation fails
 * @throws {ConflictError} When username already exists
 */
async function createIdentity(
  username: string,
  passcode: string
): Promise<Identity> {
  // Implementation
}
```

**API Documentation**:
```typescript
/**
 * @api {post} /identities Create Identity
 * @apiName CreateIdentity
 * @apiGroup Identity
 * @apiVersion 1.0.0
 * 
 * @apiParam {String} username Unique username
 * @apiParam {String} passcode Strong passcode
 * 
 * @apiSuccess {Object} identity Created identity object
 * @apiSuccess {String} identity.id Unique identifier
 * @apiSuccess {String} identity.username Username
 */
```

### Community Guidelines

**Communication**:
- Be respectful and inclusive
- Use clear, concise language
- Provide constructive feedback
- Help other developers

**Code Review**:
- Review for security issues
- Check for performance problems
- Ensure proper error handling
- Verify documentation updates

**Reporting Issues**:
- Use issue templates
- Provide detailed descriptions
- Include reproduction steps
- Attach relevant logs

---

## Support & Resources

### Documentation

- **API Reference**: https://docs.identity-protocol.com/api
- **SDK Documentation**: https://docs.identity-protocol.com/sdk
- **User Guide**: https://docs.identity-protocol.com/user
- **Security Guide**: https://docs.identity-protocol.com/security

### Community

- **GitHub**: https://github.com/identity-protocol
- **Discord**: https://discord.gg/identity-protocol
- **Forum**: https://community.identity-protocol.com
- **Blog**: https://blog.identity-protocol.com

### Support

- **Email**: dev-support@identity-protocol.com
- **Slack**: #identity-protocol-dev
- **Stack Overflow**: Tagged with `identity-protocol`
- **Security Issues**: security@identity-protocol.com

---

**Happy Coding! 🚀**

**Last Updated**: 2024-01-01  
**Version**: 1.0.0
