# 🔧 Integration Settings Guide

## Overview

The Par Noir Identity Protocol now includes a comprehensive **Integration Settings Manager** that allows you to:

- ✅ **View and manage API keys** for all integrations
- ✅ **Test integrations** in real-time
- ✅ **Validate API key formats** automatically
- ✅ **Save and load configurations** securely
- ✅ **Monitor integration status** with visual indicators

## 🚀 Quick Start

### 1. Access Integration Settings

1. Open your Par Noir dashboard
2. Navigate to the **Security** tab
3. Click the **"Integration Settings"** button (green button)
4. The Integration Settings Manager will open

### 2. Configure Your Integrations

The Integration Settings Manager supports these services:

| Service | Category | Required | Description |
|---------|----------|----------|-------------|
| **IPFS Storage** | Storage | ✅ Yes | Decentralized file storage |
| **SendGrid Email** | Communication | ❌ No | Email notifications |
| **Twilio SMS** | Communication | ❌ No | SMS recovery & 2FA |
| **Coinbase Commerce** | Payment | ❌ No | Cryptocurrency payments |

## 📋 Required Integrations

### IPFS Storage (Required)

**Purpose**: Stores your identity metadata and documents securely on the decentralized web.

**Setup**:
1. Go to [Infura](https://infura.io/) and create a free account
2. Create a new project
3. Enable IPFS in your project
4. Get your Project ID and Project Secret

**Required Fields**:
- **Project ID**: Your Infura IPFS project ID
- **Project Secret**: Your Infura IPFS project secret
- **IPFS URL**: `https://ipfs.infura.io:5001` (default)

## 🔧 Optional Integrations

### SendGrid Email

**Purpose**: Sends recovery emails and notifications.

**Setup**:
1. Go to [SendGrid](https://sendgrid.com/) and create a free account
2. Verify your sender email address
3. Create an API key with "Mail Send" permissions

**Required Fields**:
- **API Key**: Your SendGrid API key (starts with `SG.`)
- **From Email**: Your verified sender email address

### Twilio SMS

**Purpose**: Sends SMS recovery codes and 2FA messages.

**Setup**:
1. Go to [Twilio](https://www.twilio.com/) and create a free trial account
2. Get a phone number
3. Get your Account SID and Auth Token

**Required Fields**:
- **Account SID**: Your Twilio Account SID (starts with `AC`)
- **Auth Token**: Your Twilio Auth Token
- **From Number**: Your Twilio phone number (format: `+1234567890`)

### Coinbase Commerce

**Purpose**: Processes cryptocurrency payments for premium features.

**Setup**:
1. Go to [Coinbase Commerce](https://commerce.coinbase.com/) and create an account
2. Get your API key from the dashboard
3. Optionally set up webhooks for payment notifications

**Required Fields**:
- **API Key**: Your Coinbase Commerce API key
- **Webhook Secret**: Optional webhook secret for payment verification

## 🧪 Testing Integrations

### Individual Testing

1. Enter your API keys in the Integration Settings Manager
2. Click **"Test Integration"** for each service
3. View the test results:
   - ✅ **Green**: Integration working correctly
   - ❌ **Red**: Integration failed (check your API keys)
   - 🔄 **Blue**: Testing in progress

### Batch Testing

1. Configure all your integrations
2. Click **"Run All Integration Tests"** in the test page
3. View comprehensive results for all services

## 💾 Configuration Management

### Saving Configuration

- Click **"Save Configuration"** to store your settings
- Configuration is saved locally in your browser
- Settings persist between sessions

### Loading Configuration

- Click **"Load Configuration"** to restore saved settings
- Useful when switching between devices
- Automatically loads on page refresh

### Resetting Configuration

- Click **"Reset All"** to clear all API keys
- Use this if you need to start fresh
- Confirmation dialog prevents accidental clearing

## 🔒 Security Features

### API Key Protection

- **Password fields**: Sensitive API keys are hidden by default
- **Show/Hide toggle**: Click the eye icon to reveal/hide passwords
- **Local storage**: Keys are stored securely in your browser
- **No server transmission**: Keys are not sent to external servers during testing

### Validation

- **Format validation**: API keys are validated for correct format
- **Required field checking**: Ensures all required fields are filled
- **Real-time feedback**: Immediate validation as you type

## 🚨 Troubleshooting

### Common Issues

#### "Missing required credentials"
- **Solution**: Fill in all required fields for the integration
- **Check**: Look for red asterisks (*) indicating required fields

#### "Invalid API key format"
- **Solution**: Check the format requirements for each service
- **SendGrid**: Must start with `SG.`
- **Twilio**: Account SID must start with `AC`
- **IPFS**: Project ID and Secret should be at least 10 characters

#### "Connection failed"
- **Solution**: Verify your API keys are correct
- **Check**: Test your keys in the service's dashboard
- **Network**: Ensure you have internet connectivity

#### "Test timeout"
- **Solution**: Check your internet connection
- **Retry**: Click the test button again
- **Service status**: Check if the service is experiencing downtime

### Getting Help

1. **Check the service status**: Visit the service's status page
2. **Verify API keys**: Test keys in the service's dashboard
3. **Check documentation**: Review the service's API documentation
4. **Contact support**: Reach out to the service's support team

## 📱 Mobile Support

The Integration Settings Manager is fully responsive and works on:
- ✅ Desktop browsers
- ✅ Mobile browsers
- ✅ Tablet browsers
- ✅ PWA mode

## 🔄 Updates and Maintenance

### Regular Maintenance

- **Monthly**: Review and rotate API keys
- **Quarterly**: Test all integrations
- **Annually**: Review service usage and costs

### Key Rotation

1. Generate new API keys in the service dashboard
2. Update keys in the Integration Settings Manager
3. Test the new keys
4. Delete old keys from the service dashboard

## 📊 Integration Status

### Status Indicators

- 🟢 **Configured**: All required fields filled, ready to use
- 🟡 **Missing**: Required fields not filled
- 🔴 **Error**: Integration test failed
- 🔄 **Testing**: Currently testing the integration

### Status Summary

The Integration Settings Manager provides a quick overview of all your integrations:

```
✅ IPFS Storage: Configured
✅ SendGrid Email: Configured  
❌ Twilio SMS: Missing Keys
❌ Coinbase Commerce: Missing Keys
```

## 🎯 Best Practices

### Security
- Use strong, unique API keys for each service
- Rotate API keys regularly
- Never share API keys publicly
- Use environment variables in production

### Testing
- Test integrations after any configuration changes
- Test integrations before going live
- Keep test results for troubleshooting

### Documentation
- Document your API key sources
- Keep track of key rotation dates
- Maintain a backup of your configuration

## 🔗 Related Resources

- [Infura IPFS Documentation](https://docs.infura.io/infura/networks/ipfs)
- [SendGrid API Documentation](https://docs.sendgrid.com/)
- [Twilio API Documentation](https://www.twilio.com/docs)
- [Coinbase Commerce Documentation](https://docs.commerce.coinbase.com/)

## 📞 Support

If you need help with integrations:

1. **Check this guide** for common solutions
2. **Test your integrations** using the test page
3. **Review service documentation** for specific issues
4. **Contact the service provider** for API-related issues

---

**Note**: This integration system is designed to work offline-first and respects your privacy. API keys are stored locally and are not transmitted to external servers except when testing the specific integration.
