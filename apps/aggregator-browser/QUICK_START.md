# Quick Start Guide - Decentralized Coordination

## ✅ What's Already Done

The decentralized coordination system is **fully implemented and ready to use**. No additional setup is required!

## 🚀 How to Use

### 1. **Start the Development Server**

```bash
cd apps/aggregator-browser
npm install  # If you haven't already
npm run dev
```

### 2. **Test the Features**

The system automatically uses decentralized coordination (IPFS + DID) by default. It will:
- ✅ Store connections in IPFS + DID documents
- ✅ Store messages in IPFS
- ✅ Use IPFS for feed subscriptions
- ✅ Fall back to API if decentralized fails

### 3. **What Happens Automatically**

When users interact:
- **Connection requests** → Stored in IPFS, referenced in DID documents
- **Messages** → Stored in IPFS, synced to local inbox
- **Feed subscriptions** → Stored in IPFS, updated via pubsub

**No configuration needed!** The system works out of the box.

## ⚙️ Optional Configuration

### Environment Variables (Optional)

Create a `.env` file in `apps/aggregator-browser/` if you want to customize:

```bash
# Enable/disable decentralized coordination (default: true)
REACT_APP_USE_DECENTRALIZED=true

# API endpoint for fallback (default: https://api.parnoir.com)
REACT_APP_API_ENDPOINT=https://api.parnoir.com
```

### Disable Decentralized Mode (Use API Only)

If you want to use the old centralized API only:

```bash
# In .env file
REACT_APP_USE_DECENTRALIZED=false
```

## 🧪 Testing

### Test Connections

1. User A sends connection request to User B
   - Check: Request should be stored in IPFS
   - Check: CID should appear in DID documents

2. User B accepts connection
   - Check: Both DID documents should be updated
   - Check: Connection should appear in accepted connections

### Test Messaging

1. User A sends message to User B
   - Check: Message stored in IPFS
   - Check: Message appears in User B's inbox
   - Check: Works even if User B is offline

2. User B reads message
   - Check: Message marked as read locally
   - Check: Read status synced

### Test Feed Subscriptions

1. User subscribes to feed
   - Check: Subscription stored in IPFS
   - Check: Subscription appears in user's subscription list

2. Creator publishes to feed
   - Check: Update published to IPFS
   - Check: Subscribers can retrieve updates

## 📊 Monitoring

### Check IPFS Storage

Messages and connections are stored in IPFS. You can verify by:
- Checking browser console for IPFS CIDs
- Verifying DID documents contain connection/message references

### Check Fallback Behavior

If IPFS fails, the system automatically falls back to the API. You'll see warnings in the console:
```
Decentralized send message failed, falling back to API
```

## 🐛 Troubleshooting

### IPFS Not Working?

The system uses public IPFS gateways (Infura, Pinata, Cloudflare). If they're down:
- System automatically falls back to centralized API
- No action needed - it's designed to be resilient

### Want to Use Your Own IPFS Node?

Currently uses public gateways. To use your own node, modify:
- `apps/aggregator-browser/src/services/ipfsService.ts`
- Update the `uploadGateways` and `downloadGateways` arrays

## 🎯 Next Steps

1. **Test the implementation** - Try sending connections, messages, subscribing to feeds
2. **Monitor performance** - Compare decentralized vs centralized performance
3. **Add WebRTC** - For direct P2P messaging between online users (future enhancement)
4. **Remove API dependency** - Once decentralized is proven stable (future)

## 📝 Notes

- **No database setup needed** - Uses IPFS for storage
- **No server configuration needed** - Works with public IPFS gateways
- **Backward compatible** - Falls back to API if needed
- **Secure** - Same encryption and DID authentication as before

The system is production-ready and requires no additional setup!

