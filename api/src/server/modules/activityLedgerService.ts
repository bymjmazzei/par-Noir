/**
 * Activity Ledger Service
 * Records all user activities chronologically
 * Stored in Google Drive (decentralized) - users own their data
 * Uses Google Sheets for better performance and querying
 */

import crypto from 'crypto';
import { ActivityLedgerSheetsService, ActivityEntry as SheetsActivityEntry } from './activityLedgerSheetsService';

export interface ActivityEntry {
  activity_id: string;
  user_pn_identifier: string;
  activity_type: string;
  target_type?: string;
  target_pn_identifier?: string; // pn-identifier when target_type is 'user', otherwise the target ID
  actor_pn_identifier?: string;
  metadata?: any;
  created_at: string;
}

export type ActivityType = 
  | 'like' 
  | 'comment' 
  | 'repost' 
  | 'follow' 
  | 'connection_request' 
  | 'connection_accepted'
  | 'feed_subscription'
  | 'view'
  | 'share'
  | 'message_sent'
  | 'message_received';

export class ActivityLedgerService {
  /**
   * Normalize identifier to pn-identifier format
   */
  private static normalizeToPnIdentifier(did: string): string {
    return did.startsWith('pn-') ? did : `pn-${did}`;
  }

  /**
   * Record an activity
   */
  static async recordActivity(
    accessToken: string,
    metadataFolderId: string,
    userPnIdentifier: string,
    activityType: ActivityType,
    options?: {
      targetType?: string;
      targetPnIdentifier?: string; // pn-identifier when targetType is 'user', otherwise the target ID
      actorPnIdentifier?: string;
      metadata?: any;
    }
  ): Promise<ActivityEntry> {
    // Normalize all pn-identifiers (handles legacy data)
    const normalizedUserPnIdentifier = this.normalizeToPnIdentifier(userPnIdentifier);
    const normalizedActorPnIdentifier = options?.actorPnIdentifier ? this.normalizeToPnIdentifier(options.actorPnIdentifier) : undefined;
    // Normalize targetPnIdentifier only if targetType is 'user' (not for feeds or other types)
    const normalizedTargetPnIdentifier = options?.targetPnIdentifier && options?.targetType === 'user' 
      ? this.normalizeToPnIdentifier(options.targetPnIdentifier)
      : options?.targetPnIdentifier;

    try {
      const activityId = crypto.randomUUID();
      const now = new Date().toISOString();

      // Get or create activity ledger sheet
      const spreadsheetId = await ActivityLedgerSheetsService.getActivityLedgerSheet(
        accessToken,
        metadataFolderId
      );

      // Create activity entry
      const activity: SheetsActivityEntry = {
        activity_id: activityId,
        user_pn_identifier: normalizedUserPnIdentifier,
        activity_type: activityType,
        target_type: options?.targetType || undefined,
        target_pn_identifier: normalizedTargetPnIdentifier,
        actor_pn_identifier: normalizedActorPnIdentifier,
        metadata: options?.metadata || {},
        created_at: now
      };

      // Append to sheet
      await ActivityLedgerSheetsService.appendActivity(accessToken, spreadsheetId, activity);

      return activity;
    } catch (error) {
      console.error('[ActivityLedgerService] Error recording activity via sheets:', error);
      console.error('[ActivityLedgerService] Error details:', {
        userPnIdentifier,
        activityType,
        metadataFolderId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Get activities for a user
   */
  static async getUserActivities(
    accessToken: string,
    metadataFolderId: string,
    options?: {
      limit?: number;
      offset?: number;
      activityType?: ActivityType;
    }
  ): Promise<{ activities: ActivityEntry[]; total: number }> {
    try {
      // Get or create activity ledger sheet
      const spreadsheetId = await ActivityLedgerSheetsService.getActivityLedgerSheet(
        accessToken,
        metadataFolderId
      );

      // Get activities from sheet
      const result = await ActivityLedgerSheetsService.getActivities(accessToken, spreadsheetId, {
        limit: options?.limit,
        offset: options?.offset,
        activityType: options?.activityType,
        userPnIdentifier: undefined // All activities for this user (sheet is per-user)
      });

      return result;
    } catch (error) {
      console.error('[ActivityLedgerService] Error getting activities via sheets:', error);
      console.error('[ActivityLedgerService] Error details:', {
        metadataFolderId,
        options,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      return { activities: [], total: 0 };
    }
  }
}
