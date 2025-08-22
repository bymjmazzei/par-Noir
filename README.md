# Par Noir - Sovereign Identity Protocol

Par Noir is an open-source protocol for sovereign identity, building a more secure and equitable foundation for the internet. Users own and control their digital identity completely through cryptographic proofs and zero-knowledge verification.

## 🚀 Quick Start

### Installation

```bash
npm install @par-noir/identity-sdk
```

### Basic Usage

```javascript
import { createIdentitySDK } from '@par-noir/identity-sdk';

const sdk = createIdentitySDK({
  clientId: 'your-client-id',
  redirectUri: 'https://your-app.com/callback',
  scope: 'openid profile email'
});

// Start authentication
sdk.authenticate();

// Handle callback
sdk.handleCallback().then(user => {
  console.log('Authenticated user:', user);
});
```

## 📚 Documentation

- **[API Reference](docs/api-documentation.md)** - Complete API documentation
- **[SDK Documentation](sdk/identity-sdk/README.md)** - JavaScript/TypeScript SDK guide
- **[Tutorials](tutorials/)** - Step-by-step integration guides
- **[Examples](core/identity-core/examples/)** - Working code examples

## 🏗️ Architecture

### Core Components

- **`core/identity-core/`** - Core identity management and cryptographic functions
- **`sdk/identity-sdk/`** - JavaScript/TypeScript SDK for easy integration
- **`api/`** - OAuth 2.0 server implementation
- **`apps/id-dashboard/`** - Complete working example application

### Key Features

- 🔐 **Sovereign Identity** - Users own and control their digital identity
- 🔒 **Zero-Knowledge Proofs** - Prove identity without revealing personal data
- 🌐 **Cross-Platform** - Use the same identity across web, mobile, and desktop
- 🛡️ **Military-Grade Security** - Advanced encryption and security protocols
- 📱 **OAuth 2.0 Compatible** - Works with existing authentication systems

## 🛠️ Development

### Prerequisites

- Node.js 18+
- npm or yarn

### Setup

```bash
# Clone the repository
git clone https://github.com/bymjmazzei/par-Noir.git
cd par-Noir

# Install dependencies
npm install

# Start the development server
npm run dev:dashboard
```

### Project Structure

```
par-Noir/
├── core/identity-core/     # Core identity functionality
├── sdk/identity-sdk/       # JavaScript/TypeScript SDK
├── api/                    # OAuth 2.0 server
├── apps/id-dashboard/      # Working example app
├── docs/                   # Documentation
├── tutorials/              # Integration tutorials
└── branding/              # Assets and branding
```

## 🔧 Integration Examples

### React Integration

```javascript
import { useIdentitySDK } from '@par-noir/identity-sdk/react';

function App() {
  const { user, isAuthenticated, authenticate, logout } = useIdentitySDK({
    clientId: 'your-client-id',
    redirectUri: 'https://your-app.com/callback'
  });

  if (isAuthenticated) {
    return (
      <div>
        <h1>Welcome, {user.name}!</h1>
        <button onClick={logout}>Logout</button>
      </div>
    );
  }

  return (
    <div>
      <h1>Welcome to Par Noir</h1>
      <button onClick={authenticate}>Login with Par Noir</button>
    </div>
  );
}
```

### Age Verification

```javascript
import { createAgeVerification } from '@par-noir/identity-sdk';

const ageVerifier = createAgeVerification({
  minimumAge: 18,
  clientId: 'your-client-id'
});

// Verify age without revealing birth date
ageVerifier.verifyAge(userProof).then(isValid => {
  if (isValid) {
    console.log('User is 18 or older');
  }
});
```

## 🔗 OAuth 2.0 Endpoints

### Authorization Endpoint
```
GET /oauth/authorize?response_type=code&client_id=your-client-id&redirect_uri=https://your-app.com/callback&scope=openid%20profile%20email
```

### Token Endpoint
```
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&code=authorization_code&client_id=your-client-id&client_secret=your-client-secret&redirect_uri=https://your-app.com/callback
```

### User Info Endpoint
```
GET /oauth/userinfo
Authorization: Bearer your-access-token
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build SDK
npm run build:sdk

# Start development server
npm run dev:dashboard
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🌟 Features

- **Sovereign Identity Management** - Complete control over digital identity
- **Zero-Knowledge Proofs** - Privacy-preserving verification
- **Cross-Platform SDK** - JavaScript, TypeScript, React support
- **OAuth 2.0 Compliance** - Industry-standard authentication
- **Military-Grade Security** - Advanced cryptographic protocols
- **Social Recovery** - Secure identity recovery through trusted networks
- **Age Verification** - Prove age without revealing birth date
- **Location Verification** - Prove location without revealing coordinates

## 🚀 Getting Started

1. **Install the SDK**: `npm install @par-noir/identity-sdk`
2. **Set up OAuth**: Configure your client ID and redirect URI
3. **Integrate authentication**: Use the SDK in your application
4. **Add zero-knowledge proofs**: Implement privacy-preserving features

For detailed integration guides, see our [tutorials](tutorials/) and [examples](core/identity-core/examples/).

---

**Par Noir** - It's time to own your digital self. 