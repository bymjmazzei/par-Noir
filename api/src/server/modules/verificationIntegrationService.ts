/**
 * Verification Integration Service
 * Syncs verification status from identity verification to engagement system
 */

import type { Pool } from 'pg';
import { getDatabasePool } from '../utils/database';
import { legalNameHmac } from './verifiedNameService';

export class VerificationIntegrationService {
  /**
   * Sync verification status to verified_identities table
   * Called when identity verification completes. The legal name is kept only as an HMAC.
   */
  static async syncVerificationStatus(
    identityId: string,
    verificationId: string,
    verifiedAt: string,
    legalName?: string,
    opts?: { documentHmac?: string | null; db?: Pick<Pool, 'query'> }
  ): Promise<void> {
    const db = opts?.db ?? getDatabasePool();
    const nameHmac = legalName && legalName.trim() ? legalNameHmac(legalName) : null;
    
    try {
      await db.query(`
        INSERT INTO verified_identities (identity_id, verification_id, verified_at, is_active, verification_level, legal_name_hmac, document_hmac)
        VALUES ($1, $2, $3, TRUE, 'verified', $4, $5)
        ON CONFLICT (identity_id) 
        DO UPDATE SET 
          verification_id = $2,
          verified_at = $3,
          is_active = TRUE,
          verification_level = 'verified',
          legal_name_hmac = COALESCE($4, verified_identities.legal_name_hmac),
          document_hmac = COALESCE($5, verified_identities.document_hmac)
      `, [identityId, verificationId, verifiedAt, nameHmac, opts?.documentHmac ?? null]);
      
      console.log(`✅ Synced verification status for identity: ${identityId}`);
    } catch (error) {
      console.error(`❌ Failed to sync verification status for ${identityId}:`, error);
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
      const result = await db.query(`
        SELECT 1 FROM verified_identities 
        WHERE identity_id = $1 AND is_active = TRUE
        LIMIT 1
      `, [identityId]);
      
      return result.rows.length > 0;
    } catch (error) {
      console.error(`❌ Failed to check verification status for ${identityId}:`, error);
      return false;
    }
  }
}

