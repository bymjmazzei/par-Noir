# Environment Variables Setup

## Required Environment Variables

To run the Identity Protocol dashboard, you need to set up the following environment variables:

### Coinbase Commerce
```bash
REACT_APP_COINBASE_COMMERCE_API_KEY=your_coinbase_commerce_api_key_here
COINBASE_WEBHOOK_SECRET=your_coinbase_webhook_secret_here
```

### Pinata IPFS
```bash
PINATA_API_KEY=your_pinata_api_key_here
PINATA_SECRET_KEY=your_pinata_secret_key_here
```

### IPFS Configuration
```bash
IPFS_NODE_URL=https://api.pinata.cloud
METADATA_INDEX_CID=your_metadata_index_cid_here
```

### JWT Configuration
```bash
JWT_SECRET=your_jwt_secret_here_minimum_32_characters
```

### SendGrid Email Service
```bash
SENDGRID_API_KEY=your_sendgrid_api_key_here
```

### Twilio SMS Service
```bash
TWILIO_ACCOUNT_SID=your_twilio_account_sid_here
TWILIO_AUTH_TOKEN=your_twilio_auth_token_here
```

### Firebase Configuration (if using Firebase)
```bash
REACT_APP_FIREBASE_API_KEY=your_firebase_api_key_here
REACT_APP_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your_project_id
REACT_APP_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
REACT_APP_FIREBASE_APP_ID=your_app_id
```

## Setup Instructions

1. Create a `.env` file in the `apps/id-dashboard` directory
2. Copy the variables above and replace the placeholder values with your actual API keys
3. Never commit the `.env` file to version control
4. Restart your development server after adding environment variables

## Security Notes

- **Never commit API keys to version control**
- **Use environment variables for all secrets**
- **Rotate API keys regularly**
- **Use different keys for development and production**
- **Monitor API key usage for suspicious activity**

## Getting API Keys

### Coinbase Commerce
1. Go to [Coinbase Commerce](https://commerce.coinbase.com)
2. Create an account and verify your identity
3. Go to Settings > API Keys
4. Generate a new API key

### Pinata IPFS
1. Go to [Pinata](https://pinata.cloud)
2. Create an account
3. Go to API Keys section
4. Create a new API key with "Pin File to IPFS" permission

### SendGrid
1. Go to [SendGrid](https://sendgrid.com)
2. Create an account
3. Go to Settings > API Keys
4. Create a new API key

### Twilio
1. Go to [Twilio](https://twilio.com)
2. Create an account
3. Go to Console > API Keys
4. Create a new API key
