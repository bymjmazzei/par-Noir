# Comprehensive Upgrade Implementation Plan
## Gemini AI Integration + Reporting + Paid Feeds + API System

**Last Updated**: December 2024  
**Status**: Planning Phase  
**Estimated Timeline**: 6 Sprints (12-16 weeks)

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Business Context](#business-context)
3. [Architecture Overview](#architecture-overview)
4. [Phase 1: Gemini AI Integration](#phase-1-gemini-ai-integration)
5. [Phase 2: Reputation & Reporting System](#phase-2-reputation--reporting-system)
6. [Phase 3: Paid Feed System](#phase-3-paid-feed-system)
7. [Phase 4: Commercial License & API System](#phase-4-commercial-license--api-system)
8. [Phase 5: Public Index API & Widgets](#phase-5-public-index-api--widgets)
9. [Phase 6: Integration & Testing](#phase-6-integration--testing)
10. [File Structure](#file-structure)
11. [Dependencies & Prerequisites](#dependencies--prerequisites)
12. [Testing Strategy](#testing-strategy)
13. [Deployment Plan](#deployment-plan)
14. [Risk Mitigation](#risk-mitigation)

---

## 🎯 Overview

### What This Task Is Doing

This comprehensive upgrade introduces four major features to the par Noir ecosystem:

1. **Gemini AI Integration**: Automated content moderation, metadata generation, and Google Drive compliance checking
2. **Reputation & Reporting System**: User-driven content moderation with automatic escalation
3. **Paid Feed System**: Internal content curation service ($5/month) with enhanced thought creator
4. **Commercial License & API System**: External hosting capabilities via API access (requires verification)

### Business Model Clarification

- **Paid Feed ($5/month)**: Internal curation service - users pay to curate an index within par Noir ecosystem
- **Commercial License/API**: External hosting capability - users pay to self-host feeds on their own websites
- **Veriff Verification ($5 one-time)**: Trust & safety measure (not regulatory compliance requirement)

### Key Principles

- **Privacy-First**: ZKP proofs for data sharing, encrypted storage
- **User-Owned**: All data stored locally, user controls sharing
- **Modular**: Each component operates independently
- **Scalable**: Horizontal scaling, security standards maintained
- **Compliant**: Standard content platform practices (not financial services)

---

## 🏢 Business Context

### Service Types

| Service | Type | Compliance Level | Purpose |
|---------|------|------------------|---------|
| Paid Feed | Content Curation Software | ✅ Low Risk | Internal index curation |
| API Access | Software Licensing | ✅ Low Risk | External feed hosting |
| Veriff Verification | Trust & Safety | ✅ Standard Practice | User verification |

### Cost Structure

- **Veriff Verification**: $5 one-time (valid 1 year) - Optional for feeds, Required for API
- **Feed Subscription**: $5/month or $50/year - Internal curation service
- **API Activation**: Free (after verification) - External hosting capability

---

## 🏗️ Architecture Overview

### System Components

```
par Noir Ecosystem
├── Gemini AI Service (NEW)
│   ├── Content Moderation
│   ├── Metadata Generation
│   └── Google Drive Compliance
├── Reporting System (NEW)
│   ├── Report Tracking
│   ├── Auto-Escalation
│   └── Owner Notifications
├── Paid Feed System (NEW)
│   ├── Feed Management
│   ├── Enhanced Thought Creator
│   ├── Subscription Management
│   └── Feed Discovery
├── API System (NEW)
│   ├── API Key Management
│   ├── OAuth Authentication
│   ├── Data Point Requests
│   └── Content Portability
└── Widget System (NEW)
    ├── Feed Widgets
    ├── Public Index API
    └── Subdomain Support
```

### Data Flow

```
User Upload → Gemini Check → [Pass] → Encrypt → Google Drive
                              [Fail] → Block + Error

User Reports → Gemini Re-check → Auto-Escalate if Confirmed

Feed Creation → Veriff Check → [Pass] → Create Feed → Subscription
              → [Fail] → Show Verification Required

API Activation → Veriff Check → Generate API Key → Store Encrypted
```

---

## 🔵 Phase 1: Gemini AI Integration

### 1.1 Gemini Moderation Service

**File**: `apps/id-dashboard/src/services/ai/GeminiModerationService.ts`

**Purpose**: Content moderation, metadata generation, Google Drive compliance

**Features**:
- Pre-upload content safety check
- Auto-NSFW detection (two-tier: NSFW → X-rated)
- Report validation (re-check on reports)
- Metadata generation (tags, descriptions, categories)
- Google Drive ToS compliance checking

**API Integration**:
- Google Gemini Pro Vision API (images/videos)
- Google Gemini Pro API (text/documents)
- Free tier: 1,500 requests/day
- Paid tier: $0.00025/image, $0.50 per 1M tokens

**Implementation**:

```typescript
export class GeminiModerationService {
  async checkGoogleDriveCompliance(file: File): Promise<ModerationResult>
  async detectNSFW(content: Blob): Promise<NSFWResult>
  async generateMetadata(file: File): Promise<MetadataResult>
  async validateReport(fileId: string, reportType: string): Promise<ValidationResult>
}
```

**Integration Points**:
- `GoogleDriveBackend.uploadFile()` - pre-upload check
- `FileStorageAggregator` - metadata enrichment
- Report system - validation on reports

### 1.2 Content Rating System

**File**: `apps/id-dashboard/src/types/aggregator.ts` (modify)

**New Fields**:
```typescript
interface PublicMetadata {
  // ... existing fields
  contentRating?: 'safe' | 'nsfw' | 'x-rated';
  reportCount?: number;
  autoFlagged?: boolean; // Gemini auto-detection
  lastModerationCheck?: string;
  moderationHistory?: ModerationEvent[];
}
```

### 1.3 Pre-Upload Moderation Integration

**File**: `apps/id-dashboard/src/services/storage/GoogleDriveBackend.ts` (modify)

**Changes**:
- Add moderation check before encryption
- Block upload if content violates policies
- Show user-friendly error messages

---

## 🟡 Phase 2: Reputation & Reporting System

### 2.1 Report Content Modal

**File**: `apps/id-dashboard/src/components/storage/ReportContentModal.tsx` (NEW)

**Features**:
- "Report as NSFW" option (if not already NSFW/X-rated)
- Report reason selection
- Anonymous reporting option
- Report confirmation

**UI Location**: Kebab menu in caption area (left of title, bottom of tile)

### 2.2 Kebab Menu Enhancement

**File**: `apps/id-dashboard/src/components/storage/FileStorageAggregator.tsx` (modify)

**Changes**:
- Add kebab menu to media tile caption area
- Position: Top-left opposite lock icon
- Options:
  - **For all users**: Report as NSFW
  - **For owners**: Edit metadata, Share settings, Delete

**Menu Structure**:
```
[Kebab Menu]
├── Report as NSFW (if not NSFW/X-rated)
├── [Divider if owner]
├── Edit metadata (owner only)
├── Share settings (owner only)
└── Delete (owner only)
```

### 2.3 Report Processing System

**File**: `apps/id-dashboard/src/services/reporting/ReportService.ts` (NEW)

**Features**:
- Track reports per file
- Auto-escalation: 5 reports → NSFW
- Gemini validation on reports
- Owner notification system
- Report history tracking

**Auto-Escalation Logic**:
```typescript
if (reportCount >= 5 && contentRating === 'safe') {
  // Auto-escalate to NSFW
  await updateContentRating(fileId, 'nsfw');
  await notifyOwner(fileId, 'auto_escalated');
}
```

### 2.4 Report Metadata Storage

**File**: `apps/id-dashboard/src/types/aggregator.ts` (modify)

**New Fields**:
```typescript
interface PublicMetadata {
  // ... existing fields
  reports?: Report[];
  reportCount?: number;
  lastReportedAt?: string;
}

interface Report {
  id: string;
  fileId: string;
  reporterPnId: string;
  reportType: 'nsfw' | 'spam' | 'copyright' | 'other';
  reason?: string;
  timestamp: string;
  validatedByGemini?: boolean;
  geminiResult?: 'confirmed' | 'rejected' | 'pending';
}
```

---

## 🟢 Phase 3: Paid Feed System

### 3.1 Feed Data Model

**File**: `apps/id-dashboard/src/types/feeds.ts` (NEW)

**Structure**:
```typescript
interface PaidFeed {
  id: string;
  ownerPnId: string;
  name: string;
  slug: string; // URL-friendly name
  subdomain?: string; // feedname.parnoir.com
  description: string;
  profileImage?: string;
  topPost?: EnhancedThought;
  subscriptionPrice: number; // $5/month or $50/year
  billingCycle: 'monthly' | 'annual';
  subscribers: string[]; // pN IDs (one-way connections)
  delegates: string[]; // pN IDs with edit access
  content: string[]; // File IDs in feed
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  verificationRequired: boolean;
}

interface EnhancedThought {
  id: string;
  content: string; // Rich text
  backgroundImage?: string;
  backgroundVideo?: string;
  buttons?: ThoughtButton[];
  links?: ThoughtLink[];
  polls?: ThoughtPoll[];
  forms?: ThoughtForm[];
  images?: string[]; // Multiple images
  videos?: string[]; // Multiple videos
  createdAt: string;
}
```

### 3.2 Enhanced Thought Creator

**File**: `apps/id-dashboard/src/components/feeds/EnhancedThoughtCreator.tsx` (NEW)

**Features**:
- Rich text editor (WYSIWYG)
- Add buttons with links
- Create polls
- Add response forms
- Multiple images/videos (not just background)
- Interactive elements
- Preview mode
- Save as draft

**Components**:
- `RichTextEditor.tsx` - Text editing
- `ButtonEditor.tsx` - Button creation
- `PollCreator.tsx` - Poll creation
- `FormBuilder.tsx` - Form creation
- `MediaUploader.tsx` - Multiple media uploads

### 3.3 Feed Creation UI

**File**: `apps/id-dashboard/src/components/feeds/FeedCreator.tsx` (NEW)

**Features**:
- Feed name, description, slug
- Profile image upload
- Enhanced thought creator for top post
- Subscription pricing ($5/month or $50/year)
- Subdomain option
- Verification check (Veriff if required)

**Flow**:
```
User clicks "Create Feed"
  → Check Veriff verification (if required)
  → Show feed creation form
  → User creates enhanced top post
  → User sets pricing
  → Payment processing
  → Feed created
```

### 3.4 Feed Subscription Service

**File**: `apps/id-dashboard/src/services/feeds/FeedSubscriptionService.ts` (NEW)

**Features**:
- One-way subscription (like connections but unidirectional)
- Payment processing ($5/month or $50/year)
- Auto-renewal handling
- Subscription management
- Cancellation flow

**Payment Integration**:
- Coinbase Commerce (already configured)
- Subscription management
- Webhook handling

### 3.5 Feed Discovery

**File**: `apps/aggregator-browser/src/components/FeedDiscovery.tsx` (NEW)

**Features**:
- Browse paid feeds
- Search/filter feeds
- Feed preview
- Subscribe button
- Feed categories

**Integration**: Extend discover page in `apps/aggregator-browser/src/App.tsx`

### 3.6 Feed Management

**File**: `apps/id-dashboard/src/components/feeds/FeedManager.tsx` (NEW)

**Features**:
- View owned feeds
- Edit feed settings
- Manage delegates
- View subscribers
- Add/remove content
- Update top post
- Subscription management

---

## 🔴 Phase 4: Commercial License & API System

### 4.1 API Key Service

**File**: `apps/id-dashboard/src/services/api/ApiKeyService.ts` (NEW)

**Features**:
- Auto-generate API key on activation
- Store encrypted in user metadata
- Key rotation support
- Usage tracking
- Rate limiting per key
- Revocation capability

**Key Generation**:
```typescript
async generateApiKey(pnId: string): Promise<string> {
  const key = `pn_api_${crypto.randomBytes(32).toString('hex')}`;
  await this.storeEncrypted(pnId, key);
  return key;
}
```

### 4.2 Commercial License Modal Rework

**File**: `apps/id-dashboard/src/components/LicenseModal.tsx` (MODIFY)

**Old Flow**:
- License types (perpetual/annual)
- Payment for licenses
- License keys

**New Flow**:
1. User clicks "Activate API Access"
2. Show AML/KYC requirements (Veriff)
3. User completes Veriff verification ($5 one-time)
4. Generate API key automatically
5. Store encrypted in metadata
6. Show API key (one-time display)
7. API access activated

**Changes**:
- Remove license purchase flow
- Add Veriff verification requirement
- Add API key generation
- Add API key display (one-time)
- Make it freeware (no license fees)

### 4.3 AML/KYC Service

**File**: `apps/id-dashboard/src/services/verification/AmlKycService.ts` (NEW)

**Features**:
- Use existing Veriff integration
- Generate ZKPs for verified data points
- Share verification status at transaction time
- Reusable for paid feeds + API activation

**ZKP Sharing**:
```typescript
async getRequiredDataPointsForTransaction(
  pnId: string,
  transactionType: 'feed_creation' | 'api_activation'
): Promise<VerifiedDataPoints> {
  const verified = await verifiedIdentityManager.getVerifiedIdentity(pnId);
  return {
    name: verified.dataPoints.identity_attestation,
    age: verified.dataPoints.age_attestation,
    // ... other data points
  };
}
```

### 4.4 API Endpoints

**File**: `api/src/routes/api.ts` (NEW)

**Endpoints**:

#### OAuth Authentication
```
POST /api/oauth/authorize
POST /api/oauth/token
GET /api/oauth/userinfo
```

#### Data Point Requests
```
POST /api/data/request-persistent
POST /api/data/request-transactional
GET /api/data/points/:pointId
```

#### Content Portability
```
GET /api/public-index/:pnId
GET /api/public-index/:pnId/content/:fileId
```

#### Feed API
```
GET /api/feeds/:feedId
POST /api/feeds/:feedId/subscribe
GET /api/feeds/:feedId/content
```

#### Upload Functions
```
POST /api/upload
POST /api/upload/metadata
```

### 4.5 API Authentication Middleware

**File**: `api/src/middleware/apiAuth.ts` (NEW)

**Features**:
- API key validation
- Rate limiting per key
- Usage tracking
- Error handling

---

## 🟣 Phase 5: Public Index API & Widgets

### 5.1 Public Index API

**File**: `api/src/routes/publicIndex.ts` (NEW)

**Features**:
- Expose public content from pN
- Respect share settings (granular permissions)
- Filter by feed categories
- Pagination support
- Rate limiting
- CORS support

**Endpoints**:
```
GET /api/public-index/:pnId
GET /api/public-index/:pnId/content/:fileId
GET /api/public-index/:pnId/feed/:feedId
```

### 5.2 Feed Widget Service

**File**: `apps/id-dashboard/src/services/feeds/FeedWidgetService.ts` (NEW)

**Features**:
- Generate widget embed code
- Non-customizable (standardized appearance)
- Iframe or script tag option
- Subdomain support

**Widget Code Generation**:
```typescript
generateWidgetCode(feedId: string): string {
  return `
    <iframe 
      src="https://${feed.subdomain || 'feeds'}.parnoir.com/${feedId}"
      width="100%" 
      height="600"
      frameborder="0">
    </iframe>
  `;
}
```

### 5.3 Subdomain Support

**File**: `api/src/routes/subdomain.ts` (NEW)

**Features**:
- Route subdomain requests to feeds
- DNS configuration guidance
- SSL certificate handling
- Feed resolution

**Subdomain Format**: `feedname.parnoir.com`

---

## 🟠 Phase 6: Integration & Testing

### 6.1 Shared Components

**Moderation System**:
- `GeminiModerationService` - used by upload, reporting, feeds
- `ContentRatingManager` - manages rating escalations
- `ModerationNotificationService` - notifies owners

**Payment System**:
- Payment processing (Coinbase Commerce)
- Subscription management
- AML/KYC verification (shared)

**Verification System**:
- Veriff integration (existing)
- ZKP generation for AML/KYC
- Verification status sharing

### 6.2 Integration Points

**Upload Flow**:
```
File Upload → Gemini Check → [Pass] → Encrypt → Google Drive
                              [Fail] → Block
```

**Report Flow**:
```
User Reports → Gemini Re-check → [Confirmed] → Auto-Escalate
                                 [Rejected] → Flag for Review
```

**Feed Creation Flow**:
```
Create Feed → Veriff Check → [Pass] → Payment → Feed Created
            → [Fail] → Show Verification Required
```

**API Activation Flow**:
```
Activate API → Veriff Check → [Pass] → Generate Key → Store Encrypted
             → [Fail] → Show Verification Required
```

### 6.3 Testing Strategy

**Unit Tests**:
- Gemini service methods
- Report processing logic
- Feed creation/management
- API key generation
- ZKP generation

**Integration Tests**:
- Upload with moderation
- Report escalation
- Feed subscription flow
- API authentication
- Widget embedding

**E2E Tests**:
- Complete feed creation flow
- API activation flow
- Report and moderation flow
- Widget display

---

## 📁 File Structure

### New Files

```
apps/id-dashboard/src/
├── services/
│   ├── ai/
│   │   └── GeminiModerationService.ts (NEW)
│   ├── api/
│   │   ├── ApiKeyService.ts (NEW)
│   │   └── PublicIndexService.ts (NEW)
│   ├── feeds/
│   │   ├── FeedSubscriptionService.ts (NEW)
│   │   └── FeedWidgetService.ts (NEW)
│   ├── reporting/
│   │   └── ReportService.ts (NEW)
│   └── verification/
│       └── AmlKycService.ts (NEW)
├── components/
│   ├── storage/
│   │   ├── ReportContentModal.tsx (NEW)
│   │   └── FileStorageAggregator.tsx (MODIFY - kebab menu)
│   ├── feeds/
│   │   ├── EnhancedThoughtCreator.tsx (NEW)
│   │   ├── FeedCreator.tsx (NEW)
│   │   ├── FeedManager.tsx (NEW)
│   │   └── FeedSubscriptionModal.tsx (NEW)
│   └── LicenseModal.tsx (MODIFY - rework)
└── types/
    ├── aggregator.ts (MODIFY - add contentRating, reports)
    └── feeds.ts (NEW)

api/src/
├── routes/
│   ├── publicIndex.ts (NEW)
│   ├── feedWidget.ts (NEW)
│   ├── api.ts (NEW)
│   └── subdomain.ts (NEW)
├── middleware/
│   └── apiAuth.ts (NEW)
└── server.ts (MODIFY - add routes)

apps/aggregator-browser/src/
├── components/
│   └── FeedDiscovery.tsx (NEW)
└── App.tsx (MODIFY - add feed discovery)
```

### Modified Files

- `apps/id-dashboard/src/components/storage/FileStorageAggregator.tsx`
- `apps/id-dashboard/src/services/storage/GoogleDriveBackend.ts`
- `apps/id-dashboard/src/types/aggregator.ts`
- `apps/id-dashboard/src/components/LicenseModal.tsx`
- `api/src/server.ts`

---

## 📦 Dependencies & Prerequisites

### New Dependencies

```json
{
  "dependencies": {
    "@google/generative-ai": "^0.21.0",
    "react-quill": "^2.0.0",
    "react-dropzone": "^14.2.3"
  }
}
```

### Environment Variables

```bash
# Gemini API
VITE_GEMINI_API_KEY=your_gemini_api_key

# Coinbase Commerce (already configured)
REACT_APP_COINBASE_COMMERCE_API_KEY=your_coinbase_key
COINBASE_WEBHOOK_SECRET=your_webhook_secret

# Veriff (existing)
REACT_APP_VERIFF_API_KEY=your_veriff_key
REACT_APP_VERIFF_API_SECRET=your_veriff_secret

# Subdomain
VITE_SUBDOMAIN_DOMAIN=parnoir.com
```

### Prerequisites

- Google Gemini API account (free tier available)
- Coinbase Commerce (already configured) account (for payments)
- Veriff account (existing)
- DNS access for subdomain setup
- SSL certificate for subdomains

---

## 🧪 Testing Strategy

### Unit Tests

**Gemini Service**:
- Content moderation checks
- NSFW detection
- Metadata generation
- Report validation

**Report Service**:
- Report tracking
- Auto-escalation logic
- Owner notifications

**Feed Service**:
- Feed creation
- Subscription management
- Content management

**API Service**:
- Key generation
- Authentication
- Rate limiting

### Integration Tests

- Upload → Moderation → Storage flow
- Report → Validation → Escalation flow
- Feed creation → Payment → Activation flow
- API activation → Key generation → Storage flow

### E2E Tests

- Complete feed creation journey
- API activation journey
- Report and moderation journey
- Widget embedding

---

## 🚀 Deployment Plan

### Phase 1: Gemini Integration (Week 1-2)
- Deploy Gemini service
- Update upload flow
- Test moderation

### Phase 2: Reporting (Week 3-4)
- Deploy reporting UI
- Deploy report processing
- Test escalation

### Phase 3: API System (Week 5-6)
- Deploy API endpoints
- Deploy license modal rework
- Test API activation

### Phase 4: Paid Feeds (Week 7-10)
- Deploy feed creation
- Deploy subscription system
- Deploy discovery page
- Test payment flow

### Phase 5: Widgets (Week 11-12)
- Deploy public index API
- Deploy widget service
- Deploy subdomain support
- Test embedding

### Phase 6: Integration (Week 13-14)
- Integration testing
- Bug fixes
- Performance optimization
- Documentation

---

## ⚠️ Risk Mitigation

### Technical Risks

**Gemini API Limits**:
- Risk: Free tier exceeded
- Mitigation: Monitor usage, implement caching, user opt-in for paid features

**Payment Processing**:
- Risk: Payment failures
- Mitigation: Retry logic, clear error messages, webhook verification

**Subdomain Setup**:
- Risk: DNS configuration complexity
- Mitigation: Clear documentation, automated setup where possible

### Business Risks

**Compliance**:
- Risk: Regulatory changes
- Mitigation: Regular compliance reviews, legal consultation

**User Adoption**:
- Risk: Low adoption of paid features
- Mitigation: Clear value proposition, free tier options

### Security Risks

**API Key Security**:
- Risk: Key exposure
- Mitigation: Encrypted storage, key rotation, rate limiting

**Content Moderation**:
- Risk: False positives/negatives
- Mitigation: User appeals, manual review option, transparency

---

## 📊 Success Metrics

### Gemini Integration
- Content moderation accuracy: >95%
- False positive rate: <5%
- Metadata generation adoption: >60%

### Reporting System
- Report processing time: <30 seconds
- Auto-escalation accuracy: >90%
- User satisfaction: >80%

### Paid Feeds
- Feed creation rate: >10% of active users
- Subscription conversion: >5%
- Monthly recurring revenue growth

### API System
- API activation rate: >20% of verified users
- API usage: >1000 requests/day
- Developer satisfaction: >85%

---

## 📝 Implementation Checklist

### Sprint 1: Foundation
- [ ] Set up Gemini API integration
- [ ] Create GeminiModerationService
- [ ] Extend PublicMetadata type
- [ ] Integrate pre-upload moderation
- [ ] Test content moderation

### Sprint 2: Reporting
- [ ] Create ReportContentModal
- [ ] Add kebab menu to media tiles
- [ ] Create ReportService
- [ ] Implement auto-escalation
- [ ] Add owner notifications

### Sprint 3: API System
- [ ] Create ApiKeyService
- [ ] Rework LicenseModal
- [ ] Create AmlKycService
- [ ] Implement API endpoints
- [ ] Add API authentication middleware

### Sprint 4: Paid Feeds (Part 1)
- [ ] Create feed data model
- [ ] Build EnhancedThoughtCreator
- [ ] Create FeedCreator component
- [ ] Implement feed storage
- [ ] Test feed creation

### Sprint 5: Paid Feeds (Part 2)
- [ ] Create FeedSubscriptionService
- [ ] Integrate payment processing
- [ ] Build FeedDiscovery component
- [ ] Create FeedManager component
- [ ] Test subscription flow

### Sprint 6: Widgets & Polish
- [ ] Create PublicIndexService
- [ ] Build FeedWidgetService
- [ ] Implement subdomain support
- [ ] Create widget embed code generator
- [ ] Integration testing
- [ ] Documentation

---

## 🔗 Related Documentation

- [Gemini API Documentation](https://ai.google.dev/docs)
- [Veriff Integration Guide](./apps/id-dashboard/docs/IDENTITY_VERIFICATION.md)
- [API Reference](./docs/api/API_REFERENCE.md)
- [Architecture Overview](./docs/architecture/overview.md)

---

## 👥 Team Responsibilities

### Frontend Team
- UI components (modals, forms, feeds)
- User experience flows
- Client-side integration

### Backend Team
- API endpoints
- Service layer
- Database schema
- Payment processing

### DevOps Team
- Deployment
- Subdomain setup
- Monitoring
- Performance optimization

### QA Team
- Test planning
- Test execution
- Bug tracking
- Regression testing

---

## 📞 Support & Questions

For questions or clarifications:
- Technical: Check implementation details in each phase
- Business: Refer to business context section
- Compliance: See risk mitigation section

---

**Next Steps**: Review this plan, assign tasks, and begin Sprint 1 implementation.

