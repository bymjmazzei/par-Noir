/**
 * Shared Central Metadata Aggregator shapes and path constants.
 *
 * The dashboard CMA (submit/remove/fetch) and browser CMA (paginated fetch,
 * NSFW index, TTL/dedupe cache) differ enough in API clients and behavior that
 * the full classes stay app-specific. Only identical path constants and near-
 * identical request/response type shapes live here.
 */

import type { PublicMetadata } from './types';

/** GET/POST/DELETE path for the public metadata index */
export const CENTRAL_INDEX_PATH = '/api/aggregator/metadata-index';

/** GET path for the NSFW metadata index (age-gated) */
export const NSFW_INDEX_PATH = '/api/aggregator/nsfw-index';

/** Payload shape for submitting public metadata (dashboard) */
export interface PublicMetadataSubmission {
  fileId: string;
  backend: string;
  backendFileId: string;
  name: string;
  description?: string;
  tags?: string[];
  fileType?: string;
  creator?: unknown;
  isPublic: boolean;
  uploadDate: string;
  /** String or ShareToken-like object (stringified before POST) */
  publicToken?: string | unknown;
  indexingPermissions?: {
    mode?: 'all' | 'custom' | 'none';
    allowed?: string[];
    blocked?: string[];
    updatedAt?: string;
  };
  pnIdentifier?: string;
  textPost?: unknown;
  thought?: unknown;
  thumbnailFileId?: string;
  subjects?: string[];
  feedCategories?: string[];
}

export interface CentralIndexEntry {
  fileId: string;
  metadata: PublicMetadata;
  submittedAt: string;
  pnIdentifier?: string;
}

export interface CentralIndexResponse {
  files: CentralIndexEntry[];
  updatedAt: string;
  totalFiles: number;
  /** Browser pagination (optional on older responses) */
  total?: number;
  hasMore?: boolean;
}

/** Filter params shared by public/NSFW index GET queries */
export interface CentralIndexFilters {
  tags?: string[];
  fileType?: string;
  contentClass?: 'media' | 'thought' | 'collection' | string;
  authorDid?: string;
  indexerId?: string;
  limit?: number;
  offset?: number;
}
