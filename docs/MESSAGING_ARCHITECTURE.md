# Messaging Architecture: Decentralized P2P via Google Drive

## Overview

Messaging in par Noir is **fully decentralized** and runs through Google Drive (secure cloud), maintaining the same architecture principles as media storage.

## Core Principles

1. **Decentralized**: No central message server - messages live in users' Google Drive
2. **Peer-to-Peer**: Direct communication between users
3. **Encrypted**: All messages encrypted with pN encryption standard
4. **User-Owned**: Users control their message data completely
5. **Zero Liability**: par Noir never stores message content

## Architecture

### Message Storage Structure

```
User A's Google Drive/
  └── par-noir-messages/
      ├── inbox/
      │   ├── message-{id}-{timestamp}.json (encrypted)
      │   └── ...
      ├── sent/
      │   ├── message-{id}-{timestamp}.json (encrypted)
      │   └── ...
      └── requests/
          ├── request-{fromDid}-{timestamp}.json (encrypted)
          └── ...
```

### Message Flow

#### Sending a Message

1. **User A** composes message to **User B**
2. Message encrypted with **User B's** public key (or shared secret)
3. Encrypted message stored in:
   - **User A's** `par-noir-messages/sent/` folder
   - **User B's** `par-noir-messages/inbox/` folder (via API)
4. Metadata file created with:
   - Message ID
   - From/To DIDs
   - Timestamp
   - Read status
   - Encryption metadata

#### Receiving a Message

1. **User B's** app polls their `par-noir-messages/inbox/` folder
2. New message detected via metadata
3. Message decrypted using **User B's** pN identity
4. Message displayed in inbox
5. Read receipt updated in metadata

### Message Request Flow

1. **User A** sends message request to **User B**
2. Request stored in **User B's** `par-noir-messages/requests/` folder
3. **User B** sees request in inbox
4. **User B** can accept or decline
5. If accepted:
   - Request moved to inbox
   - **User A** notified (via metadata trigger)
   - Future messages go directly to inbox

## API Endpoints

### Message Service (`messageService.ts`)

```typescript
// Get messages from user's Drive inbox
getMessages(userDid: string): Promise<Message[]>

// Send message (stores in both users' Drive folders)
sendMessage(fromDid: string, toDid: string, content: string, media?: FileId): Promise<Message>

// Send message request
sendMessageRequest(fromDid: string, toDid: string, content: string): Promise<MessageRequest>

// Accept/decline message request
respondToRequest(requestId: string, accept: boolean): Promise<void>

// Mark message as read
markAsRead(messageId: string, userDid: string): Promise<void>

// Get message requests
getMessageRequests(userDid: string): Promise<MessageRequest[]>
```

### Backend API Endpoints

```
POST /api/messages/send
  - Stores encrypted message in both users' Drive folders
  - Creates metadata entries
  - Triggers WebSocket notification

GET /api/messages/inbox?userDid={did}
  - Queries user's Drive inbox folder
  - Returns decrypted messages
  - Filters by read/unread status

GET /api/messages/requests?userDid={did}
  - Queries user's Drive requests folder
  - Returns pending message requests

POST /api/messages/requests/{requestId}/respond
  - Accepts or declines request
  - Moves request to inbox if accepted
  - Notifies sender

POST /api/messages/{messageId}/read
  - Updates read status in metadata
  - Updates read receipt timestamp
```

## Encryption

### Message Encryption

1. **Content Encryption**:
   - Message content encrypted with AES-256-GCM
   - Key derived from shared secret or recipient's public key
   - IV generated per message

2. **Metadata Encryption**:
   - Sensitive metadata (sender DID, timestamps) encrypted
   - Public metadata (message ID, read status) unencrypted for indexing

3. **Media Encryption**:
   - Media files encrypted with same pN encryption standard as content
   - Stored in Google Drive
   - Referenced by file ID in message

## Real-Time Updates

### WebSocket Integration

- WebSocket connection for real-time notifications
- Polls Google Drive metadata for changes
- Triggers UI updates when new messages arrive
- Fallback to polling if WebSocket unavailable

### Metadata Triggers

- Google Drive API webhooks (if available)
- Polling mechanism checks for new files in inbox folder
- Metadata changes trigger message refresh

## Benefits

1. **Decentralized**: No single point of failure
2. **User-Owned**: Users control their message data
3. **Encrypted**: End-to-end encryption via pN standard
4. **Portable**: Messages accessible from any pN app
5. **Scalable**: Google Drive handles storage and bandwidth
6. **Familiar**: Uses Google Drive infrastructure users already know

## Implementation Notes

- Messages stored as JSON files in Drive folders
- Each message is a separate file for easy indexing
- Metadata stored alongside encrypted content
- File naming convention: `message-{id}-{timestamp}.json`
- Batch operations for efficiency (multiple messages per API call)

