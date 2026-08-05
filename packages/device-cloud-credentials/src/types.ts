import type { StorageCredentialsEnvelope } from '@par-noir/user-owned-storage';

export interface SealedEnvelope {
  encryptedData: string;
  iv: string;
  salt: string;
  /** ISO expiry for web grace TTL; omit/null for native persist */
  expiresAt?: string | null;
  updatedAt: string;
}

export interface SealSession {
  sessionId: string;
  pnName: string;
  passcode: string;
}

export interface CredentialStore {
  get(identityId: string): Promise<SealedEnvelope | null>;
  set(identityId: string, envelope: SealedEnvelope): Promise<void>;
  clear(identityId: string): Promise<void>;
}

export interface MailboxJob {
  id: string;
  jobType: string;
  payload: Record<string, unknown>;
  createdAt: string;
  expiresAt: string;
  /** Opaque route used to claim this job (set by flush worker). */
  routeKey?: string;
}

export interface FlushContext {
  identityId: string;
  authToken: string;
  apiBaseUrl: string;
  /** Opaque inbox route key for this identity. */
  routeKey?: string;
  /** Pre-exchange fallback (SHA-256 of pepper + identity). */
  legacyRouteKey?: string;
  /** Unsealed credentials for applying jobs to the user's cloud */
  credentials: StorageCredentialsEnvelope;
  /** Required: apply a job into user cloud; return true only if materialized (safe to ack) */
  applyJob: (job: MailboxJob, credentials: StorageCredentialsEnvelope) => Promise<boolean>;
  /**
   * Extra auth headers (e.g. device proof). Merged after Bearer.
   * Factory receives method + path + optional JSON body for proof signing.
   */
  buildAuthHeaders?: (
    method: string,
    path: string,
    body?: unknown
  ) => Promise<Record<string, string>> | Record<string, string>;
}

export const WEB_GRACE_TTL_MS = 15 * 60 * 1000;
