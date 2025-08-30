# Testing the Identity Protocol SDK

This guide covers how to test the cross-platform identity SDK and its integration.

## 🧪 Testing Options

### 1. Unit Tests
Run comprehensive unit tests for the SDK:

```bash
# Run SDK tests
npm run test:sdk

# Or run from the SDK directory
cd sdk/identity-sdk
npm test
```

### 2. Test Application
Run the interactive test application:

```bash
# Start the test app
npm run dev:test-app

# Or run from the test app directory
cd apps/test-app
npm run dev
```

The test app will be available at `http://localhost:3001`

### 3. Manual Testing
Test the SDK in the main dashboard:

```bash
# Start the main dashboard
npm run dev:dashboard

# Navigate to the SDK documentation page
# http://localhost:3000/sdk-documentation
```

## 🎯 Test Scenarios

### Authentication Flow Testing

1. **Basic Authentication**
   - Configure client ID and redirect URI
   - Click "Sign in with Identity Protocol"
   - Verify OAuth flow starts
   - Check callback handling

2. **Session Management**
   - Authenticate successfully
   - Verify session is stored
   - Test logout functionality
   - Check session persistence

3. **Error Handling**
   - Test invalid client ID
   - Test network errors
   - Test expired tokens
   - Test malformed callbacks

4. **Cross-Platform Testing**
   - Test with different platforms
   - Verify platform-specific behavior
   - Test custom configurations

### Compliance Data Collection Testing

1. **Data Collection Flow**
   - Request additional data
   - Test form validation
   - Verify consent handling
   - Check data submission

2. **Field Types**
   - Test text fields
   - Test email fields
   - Test phone fields
   - Test date fields
   - Test select fields
   - Test checkbox fields
   - Test textarea fields

3. **Validation**
   - Test required fields
   - Test field validation
   - Test consent requirements
   - Test error messages

## 🔧 Test Configuration

### Environment Setup

```bash
# Install dependencies
npm install

# Build SDK
cd sdk/identity-sdk
npm run build

# Start test app
cd ../../apps/test-app
npm run dev
```

### Test Data

Use these test configurations:

```javascript
// Test configuration
const testConfig = {
  clientId: 'test-client-id',
  redirectUri: 'http://localhost:3001/callback',
  scopes: ['openid', 'profile', 'email'],
  storage: 'localStorage',
  autoRefresh: true,
  debug: true
};
```

### Mock Endpoints

For testing without a real OAuth server:

```javascript
// Mock OAuth endpoints
const mockEndpoints = {
  authorization: 'https://mock-oauth.com/authorize',
  token: 'https://mock-oauth.com/token',
  userInfo: 'https://mock-oauth.com/userinfo',
  revocation: 'https://mock-oauth.com/revoke'
};
```

## 📊 Test Coverage

### SDK Core Functions

- [x] SDK initialization
- [x] Authentication flow
- [x] Callback handling
- [x] Token management
- [x] Session storage
- [x] Event handling
- [x] Error handling
- [x] Logout functionality

### React Integration

- [x] useIdentitySDK hook
- [x] State management
- [x] Event listeners
- [x] Loading states
- [x] Error states

### Compliance Features

- [x] Data collection requests
- [x] Form validation
- [x] Consent handling
- [x] Field types
- [x] Error messages

## 🐛 Debugging

### Enable Debug Mode

```javascript
const config = createSimpleConfig(
  'test-client-id',
  'http://localhost:3001/callback',
  { debug: true }
);
```

### Check Console Logs

The SDK logs detailed information when debug mode is enabled:

```javascript
// SDK debug logs
console.log('SDK initialized with config:', config);
console.log('Authentication started for platform:', platform);
console.log('OAuth callback received:', callbackUrl);
console.log('Session created:', session);
```

### Event Monitoring

Listen to SDK events for debugging:

```javascript
sdk.on('auth_started', (data) => {
  console.log('Auth started:', data);
});

sdk.on('auth_success', (session) => {
  console.log('Auth success:', session);
});

sdk.on('auth_error', (error) => {
  console.error('Auth error:', error);
});
```

## 🚀 Performance Testing

### Load Testing

Test SDK performance under load:

```bash
# Run performance tests
npm run test:performance

# Test with multiple concurrent users
npm run test:load
```

### Memory Testing

Check for memory leaks:

```bash
# Run memory tests
npm run test:memory

# Monitor memory usage
npm run test:memory:monitor
```

## 🔒 Security Testing

### OAuth Security

- [x] State parameter validation
- [x] CSRF protection
- [x] Token validation
- [x] Secure storage
- [x] Session management

### Data Protection

- [x] Consent validation
- [x] Data encryption
- [x] Secure transmission
- [x] Access control

## 📱 Cross-Platform Testing

### Browser Testing

Test in different browsers:

- [x] Chrome
- [x] Firefox
- [x] Safari
- [x] Edge

### Device Testing

Test on different devices:

- [x] Desktop
- [x] Tablet
- [x] Mobile

### Network Testing

Test under different network conditions:

- [x] Fast connection
- [x] Slow connection
- [x] Offline mode
- [x] Network errors

## 🎯 Test Results

### Expected Outcomes

1. **Authentication Flow**
   - User can authenticate successfully
   - Session is created and stored
   - Tokens are managed properly
   - Logout works correctly

2. **Error Handling**
   - Errors are caught and handled
   - User-friendly error messages
   - Graceful degradation

3. **Compliance**
   - Data collection works
   - Validation is enforced
   - Consent is required
   - Data is secure

### Success Metrics

- [x] 100% test coverage for core functions
- [x] All authentication flows work
- [x] Error handling is robust
- [x] Performance is acceptable
- [x] Security is maintained

## 🆘 Troubleshooting

### Common Issues

1. **Build Errors**
   ```bash
   # Clean and rebuild
   npm run clean
   npm run build
   ```

2. **Test Failures**
   ```bash
   # Run tests with verbose output
   npm test -- --verbose
   ```

3. **Runtime Errors**
   ```bash
   # Check console for errors
   # Enable debug mode
   # Check network requests
   ```

### Getting Help

- Check the [SDK Documentation](../sdk/)
- Review the [API Reference](../api/)
- Open an issue on GitHub
- Contact the development team

---

**Happy Testing! 🧪** 