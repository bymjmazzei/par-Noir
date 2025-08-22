# Identity Protocol

A user-controlled identity system that enables users to create their own identities that serve as access tokens for third-party platforms. Users control what personal data they share with each platform, providing privacy-first authentication.

## 🎯 **What the Identity Protocol Does**

### **User-Controlled Identities**
- Users create and own their identities
- Identities serve as access tokens for platforms
- Users control what data they share with each platform
- OAuth-like authentication flow with user-owned data

### **Data Sharing Control**
- Users decide what personal information to share
- Granular control over data sharing permissions
- Audit trail of all data sharing activities
- Privacy-first approach to authentication

## 🚀 **Key Features**

- **User-Owned Identities**: Users create and control their own identities
- **Access Token Management**: Identities serve as access tokens for third parties
- **Controlled Data Sharing**: Users decide what data to share with each platform
- **OAuth-Like Flow**: Familiar authentication patterns for developers
- **Compliance Ready**: Request additional data collection from users
- **Cross-Platform**: Works in browsers, mobile apps, and desktop applications

## 📦 **Installation**

```bash
npm install @identity-protocol/identity-sdk
```

## 🔧 **Quick Start**

### Basic Integration

```javascript
import { createIdentitySDK, createSimpleConfig } from '@identity-protocol/identity-sdk';

// Create SDK configuration
const config = createSimpleConfig(
  'your-client-id',
  'https://your-app.com/callback',
  { 
    scopes: ['openid', 'profile', 'email'],
    storage: 'localStorage',
    autoRefresh: true 
  }
);

// Initialize SDK
const sdk = createIdentitySDK(config);

// Start authentication - user creates/uses their own identity
await sdk.authenticate('identity-protocol');
```

### React Integration

```javascript
import { useIdentitySDK, createSimpleConfig } from '@identity-protocol/identity-sdk';

function MyApp() {
  const config = createSimpleConfig(
    'your-client-id',
    'https://your-app.com/callback'
  );

  const {
    session,
    isAuthenticated,
    isLoading,
    error,
    authenticate,
    logout
  } = useIdentitySDK(config);

  if (isAuthenticated) {
    return (
      <div>
        <p>Welcome! You're signed in with your Identity Protocol ID</p>
        <p>Your identity ID: {session?.identity.id}</p>
        <button onClick={logout}>Logout</button>
      </div>
    );
  }

  return (
    <button onClick={() => authenticate('identity-protocol')}>
      Sign in with your Identity Protocol ID
    </button>
  );
}
```

## 🔄 **How It Works**

1. **User Creates Identity**: Users create their own identity with their chosen data
2. **Platform Integration**: Third parties integrate the SDK to accept these identities
3. **Authentication Flow**: Users sign in with their identity (OAuth-like flow)
4. **Data Sharing**: Users control what data they share with each platform
5. **Access Token**: The identity serves as an access token for the platform

## 📊 **Data Collection**

Third-party platforms can request additional data from users for compliance purposes. The SDK does not verify or validate this data - it simply collects what users choose to share:

```javascript
// Request additional data from user for compliance
// This doesn't verify the data - it just collects what the user provides
const complianceData = await sdk.requestDataCollection({
  platform: 'your-platform',
  fields: {
    phone: {
      required: true,
      type: 'phone',
      description: 'Phone number for account verification'
    },
    address: {
      required: false,
      type: 'text',
      description: 'Billing address'
    },
    terms: {
      required: true,
      type: 'checkbox',
      description: 'I agree to the terms and conditions'
    }
  },
  consentText: 'I consent to the collection and processing of my data',
  dataUsage: 'This data will be used for account verification and compliance purposes'
});
```

## 🎯 **Use Cases**

### **For Users**
- **Own Your Identity**: Create and control your own identity
- **Data Control**: Control what data you share with each platform
- **Portable Identity**: Take your identity with you
- **Privacy-First**: Your data stays yours

### **For Developers**
- **Plug-and-Play**: Easy integration with existing apps
- **OAuth-Like API**: Familiar authentication patterns
- **Data Collection**: Request additional data from users
- **Cross-Platform**: Works everywhere

## 🔒 **Security Features**

- **State Parameter**: Prevents CSRF attacks
- **PKCE Support**: Enhanced security for public clients
- **Token Validation**: Automatic token verification
- **Secure Storage**: Encrypted local storage
- **Session Management**: Automatic session cleanup

## 📱 **Platform Support**

- **Web Applications**: Full browser support
- **Mobile Apps**: React Native, Flutter, native apps
- **Desktop Apps**: Electron, Tauri, native desktop
- **Progressive Web Apps**: Service worker support

## 🛠️ **Development**

### Building the SDK

```bash
cd sdk/identity-sdk
npm install
npm run build
```

### Running Tests

```bash
npm test
```

### Development Mode

```bash
npm run dev
```

## 🌐 **Platform Integration**

### Setting up a Platform

1. **Register your platform** with Identity Protocol
2. **Get your client credentials** (client ID, client secret)
3. **Configure your redirect URI**
4. **Integrate the SDK** into your application
5. **Handle authentication callbacks**
6. **Request additional data** as needed for compliance

## ⚠️ **Important Notes**

### **What the Identity Protocol Does**
- ✅ Identity creation and management
- ✅ Access control and permissions
- ✅ OAuth-like authentication flow
- ✅ Data sharing control
- ✅ Session management
- ✅ Privacy control

### **What the Identity Protocol Does NOT Do**
- ❌ Age verification
- ❌ Credential verification
- ❌ Personal attestations
- ❌ Data validation
- ❌ Identity verification

The Identity Protocol enables users to create their own identities and control what data they share, but it does not verify or validate the accuracy of user-provided data. Platforms are responsible for their own data validation and verification processes.

## 🤝 **Contributing**

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 **License**

MIT License - see [LICENSE](LICENSE) for details.

## 🆘 **Support**

- **Documentation**: [docs.identity-protocol.com](https://docs.identity-protocol.com)
- **Issues**: [GitHub Issues](https://github.com/identity-protocol/identity-sdk/issues)
- **Discussions**: [GitHub Discussions](https://github.com/identity-protocol/identity-sdk/discussions)
- **Email**: support@identity-protocol.com

---

**Built with ❤️ by the Identity Protocol Team** 