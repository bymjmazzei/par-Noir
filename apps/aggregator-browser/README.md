# par Noir Aggregator Browser

Licensed aggregator application for discovering and viewing public encrypted content from the par Noir network.

## Deployed At

- **URL**: `browse.parnoir.com`
- **Firebase Site**: `browse-parnoir` (needs to be created in Firebase Console)

## Architecture

This aggregator browser:
1. Reads public metadata index from Google Drive (via par Noir's licensed OAuth)
2. Displays public files with search/filter capabilities
3. Allows licensed aggregators to discover content

## Setup

### 1. Create Firebase Site

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project: `par-noir-dashboard`
3. Go to Hosting → Add another site
4. Create site: `browse-parnoir`
5. Configure custom domain: `browse.parnoir.com`

### 2. Build & Deploy

```bash
npm install
npm run build
firebase deploy --only hosting:browse
```

### 3. Configure Custom Domain

In Firebase Console:
1. Go to Hosting → browse-parnoir
2. Add custom domain: `browse.parnoir.com`
3. Follow DNS verification steps

## Development

```bash
npm run dev  # Starts dev server on port 3001
```

## How It Works

1. **Metadata Discovery**: Reads `public-file-index.json` from Google Drive (`par Noir - _metadata` folder)
2. **Authentication**: Uses licensed aggregator tokens to access par Noir's Google OAuth
3. **Fallback**: Uses localStorage cache if API unavailable (for testing)

## Feed Subscriptions & Google Drive Storage

Feed subscriptions are stored on creator's Google Drive:
- **Creator** stores subscriber info on their Google Drive (`par-noir-media/feed-{feedId}-subscribers.json`)
- **Subscriber** stores local reference in browser localStorage (via UserStateContext)
- When subscribing:
  1. Subscriber calls API with their DID
  2. Backend stores subscription in database
  3. If creator has Google Drive connected, subscriber info is stored on creator's Drive
  4. Subscriber's local reference is stored in localStorage (already handled)

**Note**: If creator doesn't have Google Drive connected, subscription is stored in database only and can sync to Drive later when creator connects.

## Next Steps

- [ ] Implement licensed aggregator authentication
- [ ] Add par Noir aggregation API endpoint
- [ ] Implement token-based decryption (Phase 3)
- [ ] Add file preview/download with tokens
- [x] Feed subscription Google Drive storage (creator hosts, subscriber stores local reference)

