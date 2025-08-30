# Firebase Functions Setup Guide

## How to Set Up API Keys in Firebase

### Step 1: Install Firebase CLI
```bash
npm install -g firebase-tools
```

### Step 2: Login to Firebase
```bash
firebase login
```

### Step 3: Set Environment Variables in Firebase
```bash
# Set your API keys in Firebase Functions config
firebase functions:config:set coinbase.api_key="your-coinbase-api-key-here"
firebase functions:config:set sendgrid.api_key="your-sendgrid-api-key-here"
firebase functions:config:set twilio.account_sid="your-twilio-account-sid-here"
firebase functions:config:set twilio.auth_token="your-twilio-auth-token-here"
firebase functions:config:set ipfs.project_id="your-ipfs-project-id-here"
```

### Step 4: Deploy Functions
```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

### Step 5: Deploy Hosting
```bash
npm run build
firebase deploy --only hosting
```

## Alternative: Environment Variables in Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Go to Functions → Settings → Environment Variables
4. Add your API keys:
   - `COINBASE_COMMERCE_API_KEY` = `your-coinbase-api-key-here`
   - `SENDGRID_API_KEY` = `your-sendgrid-api-key-here`
   - `TWILIO_ACCOUNT_SID` = `your-twilio-account-sid-here`
   - `TWILIO_AUTH_TOKEN` = `your-twilio-auth-token-here`
   - `IPFS_PROJECT_ID` = `your-ipfs-project-id-here`

## How This Works

1. **Firebase Functions** run server-side and can access environment variables
2. **Your app** calls the Firebase Functions instead of making direct API calls
3. **API keys** are stored securely in Firebase, not in your code
4. **GitHub** won't block pushes because no secrets are in the code

## Quick Deploy Script

Create a file called `deploy.sh`:
```bash
#!/bin/bash
echo "🚀 Deploying to Firebase..."

# Set environment variables
firebase functions:config:set coinbase.api_key="your-coinbase-api-key-here"
firebase functions:config:set sendgrid.api_key="your-sendgrid-api-key-here"
firebase functions:config:set twilio.account_sid="your-twilio-account-sid-here"
firebase functions:config:set twilio.auth_token="your-twilio-auth-token-here"
firebase functions:config:set ipfs.project_id="your-ipfs-project-id-here"

# Install dependencies
cd functions && npm install && cd ..

# Build the app
npm run build

# Deploy everything
firebase deploy

echo "✅ Deployment complete!"
echo "🌐 Your app is live at: https://pn.parnoir.com"
```

Make it executable:
```bash
chmod +x deploy.sh
./deploy.sh
```

This is the **proper way** to handle API keys with Firebase hosting!
