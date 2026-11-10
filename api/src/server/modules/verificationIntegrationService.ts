/**
 * Verification Integration Service
 * The server's only verification record: "this pN is verified until <expires_at>".
 * Names, birth dates and document data live in the user-held credential, never here.
 */

import type { Pool } from 'pg';
import { getDatabasePool } from '../utils/database';

/** SQL predicate for a live verification row (optionally table-aliased). */
export function activeVerifiedSql(alias?: string): string {
  const p = alias ? `${alias}.` : '';
  return `${p}is_active = TRUE AND (${p}expires_at IS NULL OR ${p}expires_at > NOW())`;
}

export class VerificationIntegrationService {
  /** Upsert the verified flag. `verificationId` is the credential jti (not a vendor session id). */
  static async syncVerificationStatus(
    identityId: string,
    verificationId: string,
    verifiedAt: string,
    expiresAt?: string | null,
    db: Pick<Pool, 'query'> = getDatabasePool()
  ): Promise<void> {
    try {
      await db.query(
        `INSERT INTO verified_identities (identity_id, verification_id, verified_at, expires_at, is_active, verification_level)
         VALUES ($1, $2, $3, $4, TRUE, 'verified')
         ON CONFLICT (identity_id)
         DO UPDATE SET
           verification_id = $2,
           verified_at = $3,
           expires_at = $4,
           is_active = TRUE,
           verification_level = 'verified'`,
        [identityId, verificationId, verifiedAt, expiresAt ?? null]
      );
    } catch (error) {
      console.error('❌ Failed to sync verification status:', error);
      throw error;
    }
  }

  /**
   * Deactivate verification (if user's verification is revoked)
   */
  static async deactivateVerification(identityId: string): Promise<void> {
    const db = getDatabasePool();
    
    try {
      await db.query(`
        UPDATE verified_identities
        SET is_active = FALSE
        WHERE identity_id = $1
      `, [identityId]);
      
      console.log(`✅ Deactivated verification for identity: ${identityId}`);
    } catch (error) {
      console.error(`❌ Failed to deactivate verification for ${identityId}:`, error);
      throw error;
    }
  }

  /**
   * Check if identity is verified
   */
  static async isVerified(identityId: string): Promise<boolean> {
    const db = getDatabasePool();
    
    try {
      const result = await db.query(
        `SELECT 1 FROM verified_identities WHERE identity_id = $1 AND ${activeVerifiedSql()} LIMIT 1`,
        [identityId]
      );
      
      return result.rows.length > 0;
    } catch (error) {
      console.error(`❌ Failed to check verification status for ${identityId}:`, error);
      return false;
    }
  }
}
