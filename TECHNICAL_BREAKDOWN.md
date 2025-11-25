# Technical Breakdown: Implementation Details
## Detailed Technical Specifications for Upgrade Implementation

**Last Updated**: December 2024  
**Purpose**: Technical reference for developers implementing the upgrade

---

## 📋 Table of Contents

1. [Gemini AI Service Implementation](#gemini-ai-service-implementation)
2. [Reporting System Implementation](#reporting-system-implementation)
3. [Paid Feed System Implementation](#paid-feed-system-implementation)
4. [API System Implementation](#api-system-implementation)
5. [Widget System Implementation](#widget-system-implementation)
6. [Database Schema Changes](#database-schema-changes)
7. [API Endpoint Specifications](#api-endpoint-specifications)
8. [Component Specifications](#component-specifications)

---

## 🤖 Gemini AI Service Implementation

### Service Structure

```typescript
// apps/id-dashboard/src/services/ai/GeminiModerationService.ts

import { GoogleGenerativeAI } from '@google/generative-ai';

export interface ModerationResult {
  safe: boolean;
  reason?: string;
  violations?: string[];
  contentRating?: 'safe' | 'nsfw' | 'x-rated';
  confidence: number;
}

export interface NSFWResult {
  isNSFW: boolean;
  rating: 'safe' | 'nsfw' | 'x-rated';
  confidence: number;
  details?: {
    adult?: number;
    violence?: number;
    racy?: number;
  };
}

export interface MetadataResult {
  tags: string[];
  description: string;
  category?: FeedCategory;
  suggestedRating?: 'safe' | 'nsfw' | 'x-rated';
}

export class GeminiModerationService {
  private genAI: GoogleGenerativeAI;
  private apiKey: string;

  constructor() {
    this.apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
    this.genAI = new GoogleGenerativeAI(this.apiKey);
  }

  /**
   * Check content for Google Drive compliance
   */
  async checkGoogleDriveCompliance(file: File): Promise<ModerationResult> {
    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-pro-vision' });
      
      // Convert file to base64
      const base64 = await this.fileToBase64(file);
      
      const prompt = `Analyze this content for Google Drive Terms of Service compliance. 
      Check for: illegal content, CSAM, violence, spam, malware, copyright violations.
      Return JSON: {safe: boolean, reason: string, violations: string[]}`;

      const result = await model.generateContent([
        { inlineData: { data: base64, mimeType: file.type } },
        { text: prompt }
      ]);

      const response = JSON.parse(result.response.text());
      return {
        safe: response.safe,
        reason: response.reason,
        violations: response.violations || [],
        confidence: 0.9
      };
    } catch (error) {
      console.error('Gemini moderation error:', error);
      // Fail open for now (allow upload if check fails)
      return { safe: true, confidence: 0 };
    }
  }

  /**
   * Detect NSFW content (two-tier: NSFW → X-rated)
   */
  async detectNSFW(content: Blob, mimeType: string): Promise<NSFWResult> {
    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-pro-vision' });
      const base64 = await this.blobToBase64(content);

      const prompt = `Rate this content for adult content:
      - safe: No adult content
      - nsfw: Not safe for work (sexual content, nudity)
      - x-rated: Explicit sexual content
      Return JSON: {rating: string, confidence: number, adult: number, violence: number, racy: number}`;

      const result = await model.generateContent([
        { inlineData: { data: base64, mimeType } },
        { text: prompt }
      ]);

      const response = JSON.parse(result.response.text());
      
      return {
        isNSFW: response.rating !== 'safe',
        rating: response.rating,
        confidence: response.confidence,
        details: {
          adult: response.adult,
          violence: response.violence,
          racy: response.racy
        }
      };
    } catch (error) {
      console.error('NSFW detection error:', error);
      return { isNSFW: false, rating: 'safe', confidence: 0 };
    }
  }

  /**
   * Generate metadata for content
   */
  async generateMetadata(file: File): Promise<MetadataResult> {
    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-pro-vision' });
      const base64 = await this.fileToBase64(file);

      const prompt = `Generate metadata for this content:
      1. List 5-10 relevant tags (comma-separated)
      2. Write a brief description (1-2 sentences)
      3. Suggest a category: entertainment, education, news, opinion, promotion, art, community, ideology, lifestyle
      4. Suggest content rating: safe, nsfw, or x-rated
      Return JSON: {tags: string[], description: string, category: string, suggestedRating: string}`;

      const result = await model.generateContent([
        { inlineData: { data: base64, mimeType: file.type } },
        { text: prompt }
      ]);

      const response = JSON.parse(result.response.text());
      
      return {
        tags: response.tags || [],
        description: response.description || '',
        category: response.category as FeedCategory,
        suggestedRating: response.suggestedRating
      };
    } catch (error) {
      console.error('Metadata generation error:', error);
      return { tags: [], description: '' };
    }
  }

  /**
   * Validate a report (re-check content when reported)
   */
  async validateReport(fileId: string, reportType: string, content: Blob): Promise<ModerationResult> {
    // Re-check content with Gemini
    const nsfwResult = await this.detectNSFW(content, 'image/jpeg');
    
    return {
      safe: !nsfwResult.isNSFW,
      reason: nsfwResult.isNSFW ? 'Content confirmed as NSFW' : 'Content appears safe',
      contentRating: nsfwResult.rating,
      confidence: nsfwResult.confidence
    };
  }

  private async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  private async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}
```

### Integration Points

**GoogleDriveBackend.ts**:
```typescript
async uploadFile(file: File, ...): Promise<StorageFile> {
  // NEW: Pre-upload moderation check
  const moderationCheck = await geminiModerationService.checkGoogleDriveCompliance(file);
  
  if (!moderationCheck.safe) {
    throw new Error(`Content violates Google Drive policies: ${moderationCheck.reason}`);
  }

  // Continue with existing upload flow...
  const encryptedFile = await this.encrypt(file);
  // ... rest of upload
}
```

---

## 🚨 Reporting System Implementation

### Report Service

```typescript
// apps/id-dashboard/src/services/reporting/ReportService.ts

export interface Report {
  id: string;
  fileId: string;
  reporterPnId: string;
  reportType: 'nsfw' | 'spam' | 'copyright' | 'other';
  reason?: string;
  timestamp: string;
  validatedByGemini?: boolean;
  geminiResult?: 'confirmed' | 'rejected' | 'pending';
}

export class ReportService {
  private reports: Map<string, Report[]> = new Map();
  private readonly AUTO_ESCALATE_THRESHOLD = 5;

  /**
   * Submit a report
   */
  async submitReport(
    fileId: string,
    reporterPnId: string,
    reportType: string,
    reason?: string
  ): Promise<Report> {
    const report: Report = {
      id: `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      fileId,
      reporterPnId,
      reportType: reportType as Report['reportType'],
      reason,
      timestamp: new Date().toISOString(),
      geminiResult: 'pending'
    };

    // Store report
    const fileReports = this.reports.get(fileId) || [];
    fileReports.push(report);
    this.reports.set(fileId, fileReports);

    // Validate with Gemini
    await this.validateReportWithGemini(report);

    // Check for auto-escalation
    await this.checkAutoEscalation(fileId);

    return report;
  }

  /**
   * Validate report with Gemini
   */
  private async validateReportWithGemini(report: Report): Promise<void> {
    try {
      // Get file content
      const file = await this.getFileContent(report.fileId);
      
      // Check with Gemini
      const result = await geminiModerationService.validateReport(
        report.fileId,
        report.reportType,
        file
      );

      // Update report
      report.validatedByGemini = true;
      report.geminiResult = result.safe ? 'rejected' : 'confirmed';

      // If confirmed, update content rating
      if (report.geminiResult === 'confirmed' && result.contentRating) {
        await this.updateContentRating(report.fileId, result.contentRating);
        await this.notifyOwner(report.fileId, 'content_flagged');
      }
    } catch (error) {
      console.error('Report validation error:', error);
      report.validatedByGemini = false;
    }
  }

  /**
   * Check if auto-escalation is needed
   */
  private async checkAutoEscalation(fileId: string): Promise<void> {
    const reports = this.reports.get(fileId) || [];
    const nsfwReports = reports.filter(r => r.reportType === 'nsfw');
    
    if (nsfwReports.length >= this.AUTO_ESCALATE_THRESHOLD) {
      const metadata = await this.getFileMetadata(fileId);
      
      if (metadata.contentRating === 'safe') {
        // Auto-escalate to NSFW
        await this.updateContentRating(fileId, 'nsfw');
        await this.notifyOwner(fileId, 'auto_escalated');
      }
    }
  }

  /**
   * Get reports for a file
   */
  async getFileReports(fileId: string): Promise<Report[]> {
    return this.reports.get(fileId) || [];
  }

  /**
   * Get report count for a file
   */
  async getReportCount(fileId: string): Promise<number> {
    return (this.reports.get(fileId) || []).length;
  }

  private async updateContentRating(fileId: string, rating: 'safe' | 'nsfw' | 'x-rated'): Promise<void> {
    // Update metadata
    const metadata = await metadataIndexService.getMetadata(fileId);
    if (metadata) {
      metadata.contentRating = rating;
      metadata.autoFlagged = true;
      metadata.lastModerationCheck = new Date().toISOString();
      await metadataIndexService.updateMetadata(fileId, metadata);
    }
  }

  private async notifyOwner(fileId: string, reason: string): Promise<void> {
    // Send notification to file owner
    // Implementation depends on notification system
  }
}
```

### Report Modal Component

```typescript
// apps/id-dashboard/src/components/storage/ReportContentModal.tsx

interface ReportContentModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: AggregatedFile;
  onReportSubmitted: () => void;
}

export const ReportContentModal: React.FC<ReportContentModalProps> = ({
  isOpen,
  onClose,
  file,
  onReportSubmitted
}) => {
  const [reportType, setReportType] = useState<'nsfw' | 'spam' | 'copyright' | 'other'>('nsfw');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await reportService.submitReport(
        file.id,
        authenticatedUser.id,
        reportType,
        reason
      );
      onReportSubmitted();
      onClose();
    } catch (error) {
      console.error('Report submission error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Only show NSFW option if content is not already NSFW/X-rated
  const canReportNSFW = file.metadata?.contentRating !== 'nsfw' && 
                         file.metadata?.contentRating !== 'x-rated';

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="p-6">
        <h2 className="text-xl font-bold mb-4">Report Content</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Report Type</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value as any)}
              className="w-full p-2 border rounded"
            >
              {canReportNSFW && <option value="nsfw">Report as NSFW</option>}
              <option value="spam">Spam</option>
              <option value="copyright">Copyright Violation</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Reason (optional)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full p-2 border rounded"
              rows={3}
            />
          </div>

          <div className="flex justify-end space-x-2">
            <button onClick={onClose} className="px-4 py-2 border rounded">
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-4 py-2 bg-red-600 text-white rounded"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
```

### Kebab Menu Integration

```typescript
// In FileStorageAggregator.tsx - Media tile caption area

<div className="p-3">
  <div className="flex items-center justify-between">
    <p className="text-white text-xs truncate mb-1">
      {file.encrypted ? file.originalName : file.name}
    </p>
    
    {/* Kebab menu - top-left opposite lock icon */}
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpenMenuFor(file.backendFileId);
        }}
        className="p-1 text-text-secondary hover:text-text-primary"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {openMenuFor === file.backendFileId && (
        <div className="absolute top-0 right-0 bg-neutral-900 border rounded-lg shadow-lg z-50 w-48">
          {/* Report option (all users) */}
          {file.metadata?.contentRating !== 'nsfw' && 
           file.metadata?.contentRating !== 'x-rated' && (
            <button
              onClick={() => {
                setReportingFile(file);
                setShowReportModal(true);
                setOpenMenuFor(null);
              }}
              className="w-full text-left px-3 py-2 hover:bg-neutral-800"
            >
              Report as NSFW
            </button>
          )}

          {/* Owner-only options */}
          {isOwner && (
            <>
              <div className="border-t border-neutral-700 my-1" />
              <button onClick={() => handleEditMetadata(file)}>
                Edit metadata
              </button>
              <button onClick={() => openShareSettings(file)}>
                Share settings
              </button>
              <button onClick={() => handleDelete(file)}>
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  </div>
</div>
```

---

## 💰 Paid Feed System Implementation

### Feed Data Model

```typescript
// apps/id-dashboard/src/types/feeds.ts

export interface PaidFeed {
  id: string;
  ownerPnId: string;
  name: string;
  slug: string;
  subdomain?: string;
  description: string;
  profileImage?: string;
  topPost?: EnhancedThought;
  subscriptionPrice: number;
  billingCycle: 'monthly' | 'annual';
  subscribers: string[];
  delegates: string[];
  content: string[];
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  verificationRequired: boolean;
}

export interface EnhancedThought {
  id: string;
  content: string; // Rich text HTML
  backgroundImage?: string;
  backgroundVideo?: string;
  buttons?: ThoughtButton[];
  links?: ThoughtLink[];
  polls?: ThoughtPoll[];
  forms?: ThoughtForm[];
  images?: string[];
  videos?: string[];
  createdAt: string;
}

export interface ThoughtButton {
  id: string;
  label: string;
  url: string;
  style?: 'primary' | 'secondary' | 'outline';
}

export interface ThoughtLink {
  id: string;
  text: string;
  url: string;
}

export interface ThoughtPoll {
  id: string;
  question: string;
  options: PollOption[];
  expiresAt?: string;
}

export interface PollOption {
  id: string;
  text: string;
  votes: number;
}

export interface ThoughtForm {
  id: string;
  title: string;
  fields: FormField[];
  submitUrl?: string;
}

export interface FormField {
  id: string;
  type: 'text' | 'email' | 'textarea' | 'select';
  label: string;
  required: boolean;
  options?: string[];
}
```

### Feed Subscription Service

```typescript
// apps/id-dashboard/src/services/feeds/FeedSubscriptionService.ts

export class FeedSubscriptionService {
  /**
   * Subscribe to a feed
   */
  async subscribeToFeed(
    feedId: string,
    subscriberPnId: string,
    billingCycle: 'monthly' | 'annual'
  ): Promise<Subscription> {
    const feed = await this.getFeed(feedId);
    
    // Check if already subscribed
    if (feed.subscribers.includes(subscriberPnId)) {
      throw new Error('Already subscribed to this feed');
    }

    // Process payment
    const payment = await this.processPayment({
      amount: billingCycle === 'monthly' ? 5 : 50,
      currency: 'USD',
      pnId: subscriberPnId,
      feedId
    });

    // Create subscription
    const subscription: Subscription = {
      id: `sub_${Date.now()}`,
      feedId,
      subscriberPnId,
      billingCycle,
      status: 'active',
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: this.calculatePeriodEnd(billingCycle),
      createdAt: new Date().toISOString()
    };

    // Update feed
    feed.subscribers.push(subscriberPnId);
    await this.updateFeed(feedId, feed);

    return subscription;
  }

  /**
   * Process payment using Coinbase Commerce
   */
  private async processPayment(params: PaymentParams): Promise<PaymentResult> {
    const { CoinbaseProxy } = await import('../../utils/coinbaseProxy');
    
    const checkoutData = {
      name: `Feed Subscription: ${params.feedName}`,
      description: `${params.billingCycle === 'monthly' ? 'Monthly' : 'Annual'} subscription`,
      pricing_type: 'fixed_price',
      local_price: {
        amount: params.billingCycle === 'monthly' ? '5.00' : '50.00',
        currency: 'USD'
      },
      metadata: {
        feedId: params.feedId,
        pnId: params.pnId,
        billingCycle: params.billingCycle
      }
    };

    const checkout = await CoinbaseProxy.createCheckout(checkoutData);
    
    return {
      checkoutId: checkout.id,
      hostedUrl: checkout.hosted_url,
      status: 'pending'
    };
  }

  /**
   * Calculate period end date
   */
  private calculatePeriodEnd(billingCycle: 'monthly' | 'annual'): string {
    const date = new Date();
    if (billingCycle === 'monthly') {
      date.setMonth(date.getMonth() + 1);
    } else {
      date.setFullYear(date.getFullYear() + 1);
    }
    return date.toISOString();
  }
}
```

---

## 🔑 API System Implementation

### API Key Service

```typescript
// apps/id-dashboard/src/services/api/ApiKeyService.ts

export class ApiKeyService {
  /**
   * Generate API key for pN
   */
  async generateApiKey(pnId: string): Promise<string> {
    const key = `pn_api_${crypto.randomBytes(32).toString('hex')}`;
    
    // Store encrypted in user metadata
    await this.storeEncryptedApiKey(pnId, key);
    
    return key;
  }

  /**
   * Store API key encrypted
   */
  private async storeEncryptedApiKey(pnId: string, key: string): Promise<void> {
    const encrypted = await this.encrypt(key, pnId);
    
    // Store in secure metadata
    await SecureMetadataStorage.updateMetadataField(
      pnId,
      'apiKey',
      encrypted
    );
  }

  /**
   * Get API key (decrypted)
   */
  async getApiKey(pnId: string): Promise<string | null> {
    const encrypted = await SecureMetadataStorage.getMetadataField(pnId, 'apiKey');
    if (!encrypted) return null;
    
    return await this.decrypt(encrypted, pnId);
  }

  /**
   * Validate API key
   */
  async validateApiKey(key: string): Promise<{ valid: boolean; pnId?: string }> {
    // Check rate limits
    // Validate key format
    // Return associated pN ID
  }
}
```

### License Modal Rework

```typescript
// apps/id-dashboard/src/components/LicenseModal.tsx (MODIFY)

export const LicenseModal: React.FC<LicenseModalProps> = ({
  isOpen,
  onClose,
  onActivated
}) => {
  const [verificationStatus, setVerificationStatus] = useState<'none' | 'pending' | 'verified'>('none');
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  // Check verification status
  useEffect(() => {
    checkVerificationStatus();
  }, []);

  const checkVerificationStatus = async () => {
    const status = await verifiedIdentityManager.getVerificationStatus(identityId);
    if (status.isVerified) {
      setVerificationStatus('verified');
      // Check if API key exists
      const key = await apiKeyService.getApiKey(identityId);
      if (key) {
        setApiKey(key);
      }
    }
  };

  const handleActivate = async () => {
    if (verificationStatus !== 'verified') {
      // Show Veriff verification modal
      setShowVeriffModal(true);
      return;
    }

    // Generate API key
    const key = await apiKeyService.generateApiKey(identityId);
    setApiKey(key);
    setShowApiKey(true);
    onActivated();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="p-6">
        <h2 className="text-xl font-bold mb-4">Activate API Access</h2>
        
        {verificationStatus !== 'verified' && (
          <div className="mb-4">
            <p className="mb-2">API access requires identity verification.</p>
            <p className="text-sm text-gray-600 mb-4">
              Complete Veriff verification ($5 one-time, valid 1 year) to activate API access.
            </p>
            <button onClick={handleActivate} className="px-4 py-2 bg-blue-600 text-white rounded">
              Start Verification
            </button>
          </div>
        )}

        {verificationStatus === 'verified' && !showApiKey && (
          <div>
            <p className="mb-4">Your identity is verified. Generate API key?</p>
            <button onClick={handleActivate} className="px-4 py-2 bg-green-600 text-white rounded">
              Generate API Key
            </button>
          </div>
        )}

        {showApiKey && apiKey && (
          <div>
            <p className="mb-2 font-bold">Your API Key (save this - shown once):</p>
            <div className="bg-gray-100 p-3 rounded mb-4 font-mono text-sm">
              {apiKey}
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(apiKey)}
              className="px-4 py-2 bg-blue-600 text-white rounded"
            >
              Copy to Clipboard
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
};
```

---

## 📊 Database Schema Changes

### Metadata Extensions

```typescript
// Extend PublicMetadata type
interface PublicMetadata {
  // ... existing fields
  
  // Content rating
  contentRating?: 'safe' | 'nsfw' | 'x-rated';
  reportCount?: number;
  autoFlagged?: boolean;
  lastModerationCheck?: string;
  
  // Reports
  reports?: Report[];
  lastReportedAt?: string;
  
  // Moderation history
  moderationHistory?: ModerationEvent[];
}

interface ModerationEvent {
  id: string;
  type: 'auto_detection' | 'user_report' | 'manual_review';
  action: 'flagged' | 'escalated' | 'cleared';
  rating: 'safe' | 'nsfw' | 'x-rated';
  timestamp: string;
  source?: string; // 'gemini' | 'user_report' | 'admin'
}
```

### Feed Storage

```typescript
// Store feeds in user metadata or separate feed index
interface FeedStorage {
  feeds: Map<string, PaidFeed>;
  subscriptions: Map<string, Subscription[]>;
  delegates: Map<string, string[]>; // feedId -> delegate pN IDs
}
```

---

## 🔌 API Endpoint Specifications

### OAuth Endpoints

```typescript
// POST /api/oauth/authorize
Request: {
  client_id: string;
  redirect_uri: string;
  scope: string[];
  state: string;
}

Response: {
  authorization_code: string;
  state: string;
}

// POST /api/oauth/token
Request: {
  code: string;
  client_id: string;
  client_secret: string;
  redirect_uri: string;
}

Response: {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token?: string;
}
```

### Data Point Endpoints

```typescript
// POST /api/data/request-persistent
Request: {
  api_key: string;
  data_points: string[];
  purpose: string;
}

Response: {
  proofs: ZKPProof[];
  expires_at: string;
}

// POST /api/data/request-transactional
Request: {
  api_key: string;
  data_points: string[];
  transaction_id: string;
}

Response: {
  proofs: ZKPProof[];
  transaction_id: string;
}
```

### Feed API Endpoints

```typescript
// GET /api/feeds/:feedId
Response: {
  feed: PaidFeed;
  content: AggregatedFile[];
}

// POST /api/feeds/:feedId/subscribe
Request: {
  api_key: string;
  billing_cycle: 'monthly' | 'annual';
}

Response: {
  subscription_id: string;
  status: 'active';
  current_period_end: string;
}
```

---

## 🎨 Component Specifications

### Enhanced Thought Creator

**Key Features**:
- Rich text editor (React Quill)
- Button editor (add buttons with links)
- Poll creator (create polls)
- Form builder (create forms)
- Media uploader (multiple images/videos)
- Preview mode

**Component Structure**:
```
EnhancedThoughtCreator
├── RichTextEditor (React Quill)
├── MediaUploader (multiple files)
├── ButtonEditor (add buttons)
├── PollCreator (create polls)
├── FormBuilder (create forms)
└── PreviewPanel (preview thought)
```

### Feed Creator

**Key Features**:
- Feed name, description, slug
- Profile image upload
- Enhanced thought creator integration
- Pricing selection ($5/month or $50/year)
- Subdomain option
- Verification check

**Flow**:
1. User enters feed details
2. User creates enhanced top post
3. User selects pricing
4. System checks verification
5. Payment processing
6. Feed created

---

## 📝 Implementation Notes

### Error Handling

- All API calls should have try-catch blocks
- User-friendly error messages
- Logging for debugging
- Graceful degradation

### Performance

- Cache Gemini results
- Batch API requests where possible
- Lazy load components
- Optimize image/video handling

### Security

- Encrypt API keys
- Validate all inputs
- Rate limiting on APIs
- CORS configuration
- XSS prevention

### Testing

- Unit tests for services
- Integration tests for flows
- E2E tests for user journeys
- Performance tests

---

**This document serves as a technical reference during implementation. Refer to IMPLEMENTATION_PLAN.md for the overall strategy and timeline.**

