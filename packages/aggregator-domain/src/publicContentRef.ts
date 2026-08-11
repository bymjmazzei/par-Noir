/**
 * Provider-agnostic pointer to anonymously readable public ciphertext on the owner's cloud.
 * The API stores this + shareKey; it must never store the ciphertext bytes.
 */
import type { PublicCipherEnvelope } from './tokenDecryption';
export type { PublicCipherEnvelope } from './tokenDecryption';
import { isSafePublicFetchUrlShape } from './safePublicFetchUrl';

export type PublicContentBackend =
  | 'google_drive'
  | 'dropbox'
  | 'onedrive'
  | 'aws_s3'
  | 'azure_blob'
  | 'ftp'
  | string;

export interface PublicContentRef {
  backend: PublicContentBackend;
  /** Provider object / file id */
  objectId: string;
  /**
   * URL the blind proxy can GET without owner OAuth.
   * Drive: uc?export=download&id=… or webContentLink; Dropbox/S3/Azure: shared/public object URL.
   */
  publicUrl: string;
}

export function isPublicContentRef(value: unknown): value is PublicContentRef {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.backend === 'string' &&
    v.backend.length > 0 &&
    typeof v.objectId === 'string' &&
    v.objectId.length > 0 &&
    typeof v.publicUrl === 'string' &&
    isSafePublicFetchUrlShape(v.publicUrl, v.backend)
  );
}

export function isPublicCipherEnvelope(value: unknown): value is PublicCipherEnvelope {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.encrypted === 'string' && v.encrypted.length > 0 && typeof v.iv === 'string' && v.iv.length > 0;
}

/**
 * Reject API publish bodies that still embed full-file ciphertext in publicToken.
 * Observed legacy shape: publicToken.shareEncrypted.encrypted ∝ file size.
 */
export function publicTokenContainsEmbeddedCiphertext(publicToken: unknown): boolean {
  if (publicToken == null) return false;
  let parsed: unknown = publicToken;
  if (typeof publicToken === 'string') {
    const trimmed = publicToken.trim();
    if (!trimmed) return false;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // Oversized opaque string is treated as embedded content.
      return trimmed.length > 8_000;
    }
  }
  if (!parsed || typeof parsed !== 'object') return false;
  const token = parsed as Record<string, unknown>;
  const se = token.shareEncrypted;
  if (se == null) {
    // Heuristic: huge token without shareEncrypted still looks like embedded payload.
    try {
      return JSON.stringify(token).length > 8_000;
    } catch {
      return true;
    }
  }
  if (typeof se === 'string') {
    return se.length > 0;
  }
  if (typeof se === 'object' && se !== null) {
    const enc = (se as { encrypted?: unknown }).encrypted;
    return typeof enc === 'string' && enc.length > 0;
  }
  return false;
}
