# Pinata IPFS Setup Guide

## Getting Your Pinata Secret Key

### Step 1: Log into Pinata
1. Go to [pinata.cloud](https://pinata.cloud)
2. Log into your account
3. Go to your **API Keys** section

### Step 2: Create or View API Key
1. Click **"New API Key"** or view existing key
2. Make sure it has **"Pin File to IPFS"** permission
3. Copy both the **API Key** and **Secret Key**

### Step 3: Update the Code
Replace the placeholder in `src/utils/ipfsMetadataService.ts`:

```typescript
constructor() {
  // Use your Pinata API keys
  this.pinataApiKey = '950c8f37317d5ebaae77'; // ✅ Already set
  this.pinataSecretKey = 'YOUR_ACTUAL_SECRET_KEY_HERE'; // ⚠️ Replace this
}
```

## Testing the Metadata Service

### Test 1: Basic Connection
```javascript
// In browser console
import { ipfsMetadataService } from './src/utils/ipfsMetadataService';
const isConnected = await ipfsMetadataService.testConnection();
console.log('IPFS Connection:', isConnected);
```

### Test 2: Store Metadata
```javascript
const metadata = {
  pnId: 'test-pn-123',
  name: 'Test pN',
  description: 'Testing IPFS metadata storage'
};

const result = await ipfsMetadataService.storePNMetadata(metadata);
console.log('Store Result:', result);
```

### Test 3: Retrieve Metadata
```javascript
if (result.success) {
  const retrieved = await ipfsMetadataService.getPNMetadata(result.cid);
  console.log('Retrieved:', retrieved);
}
```

## What This Gives You

✅ **Decentralized Storage** - Data on IPFS network  
✅ **Mutable Updates** - Can update pN metadata  
✅ **Rule 1 Compliant** - No central authority  
✅ **Censorship Resistant** - Distributed storage  
✅ **Immediate Access** - No deployment delays  

## Next Steps

1. **Add your secret key** (see Step 3 above)
2. **Test the connection** (see Test 1)
3. **Try storing metadata** (see Test 2)
4. **Verify retrieval** (see Test 3)

Your pN metadata system will be fully functional once you add the secret key!
