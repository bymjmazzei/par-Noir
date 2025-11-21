export interface AggregatedFile {
  id: string;
  backend: string;
  backendFileId: string;
  name: string;
  originalName?: string;
  mimeType?: string;
  size?: number | string;
  modifiedTime?: string;
  encrypted?: boolean;
  aggregatedAt?: string;
  visibility?: 'public' | 'private' | 'friends';
  [key: string]: any;
}

export interface AuthSession {
  id: string;
  pnName: string;
  nickname: string;
  accessToken: string;
  expiresIn: number;
  authenticatedAt: string;
  publicKey: string;
  passcode?: string;
  authToken?: string;
}

export interface ShareToken {
  fileId: string;
  contentKey: {
    encrypted: string;
    wrappedWith: string;
    iv: string;
  };
  expiresAt: string;
  permissions: string[];
  shareKey?: string;
  shareEncrypted?: string;
  [key: string]: any;
}

export interface EncryptedFilePackage {
  version: string;
  encrypted: string;
  iv: string;
  salt: string;
  contentKey?: {
    encrypted: string;
    wrappedWith?: string;
    iv: string;
    salt?: string;
  };
  metadata: {
    originalName: string;
    originalSize: number;
    originalMimeType: string;
    encryptedAt: string;
    encryptedBy?: string;
    backend?: string;
    backendFileId?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

export type FeedCategory =
  | 'beauty-fashion'
  | 'sports-fitness'
  | 'tv-film-entertainment'
  | 'music-performing-arts'
  | 'gaming-esports'
  | 'technology-gadgets'
  | 'home-interior-design'
  | 'food-culinary'
  | 'travel-adventure'
  | 'wellness-mental-health'
  | 'business-entrepreneurship'
  | 'science-education'
  | 'art-design'
  | 'diy-maker-culture'
  | 'parenting-family-life'
  | 'eco-sustainability'
  | 'finance-investing'
  | 'motors-automotive'
  | 'humor-meme-culture'
  | 'adults-only';

export interface PublicMetadata {
  fileId: string;
  backend: string;
  backendFileId: string;
  name: string;
  description?: string;
  keywords?: string[];
  uploadDate?: string;
  fileType?: string;
  isPublic?: boolean;
  creator?: any;
  thumbnail?: string;
  publicToken?: any;
  engagement?: any;
  inReplyTo?: any;
  repostOf?: any;
  isPartOf?: any;
  metadata?: Record<string, any>;
  sharedWith?: string[];
  feedCategories?: FeedCategory[];
  indexingPermissions?: {
    mode?: 'all' | 'custom' | 'none';
    allowed?: string[];
    blocked?: string[];
    updatedAt?: string;
  };
  [key: string]: any;
}

export interface StorageCredentialEntry {
  email?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: string | null;
  backendId?: string;
  keyPrefix?: string;
  [key: string]: any;
}
