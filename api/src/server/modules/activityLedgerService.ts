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
  user_did: string;
  activity_type: string;
  target_type?: string;
  target_id?: string;
  actor_did?: string;
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
   * Record an activity
   */
  static async recordActivity(
    accessToken: string,
    metadataFolderId: string,
    userDid: string,
    activityType: ActivityType,
    options?: {
      targetType?: string;
      targetId?: string;
      actorDid?: string;
      metadata?: any;
    }
  ): Promise<ActivityEntry> {
    try {
      const activityId = crypto.randomUUID();
      const now = new Date().toISOString();

      // Get or create activity ledger sheet
      const spreadsheetId = await ActivityLedgerSheetsService.getOrCreateActivityLedgerSheet(
        accessToken,
        metadataFolderId
      );

      // Create activity entry
      const activity: SheetsActivityEntry = {
        activity_id: activityId,
        user_did: userDid,
        activity_type: activityType,
        target_type: options?.targetType || undefined,
        target_id: options?.targetId || undefined,
        actor_did: options?.actorDid || undefined,
        metadata: options?.metadata || {},
        created_at: now
      };

      // Append to sheet
      await ActivityLedgerSheetsService.appendActivity(accessToken, spreadsheetId, activity);

      return activity;
    } catch (error) {
      console.error('[ActivityLedgerService] Error recording activity via sheets:', error);
      console.error('[ActivityLedgerService] Error details:', {
        userDid,
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
      const spreadsheetId = await ActivityLedgerSheetsService.getOrCreateActivityLedgerSheet(
        accessToken,
        metadataFolderId
      );

      // Get activities from sheet
      const result = await ActivityLedgerSheetsService.getActivities(accessToken, spreadsheetId, {
        limit: options?.limit,
        offset: options?.offset,
        activityType: options?.activityType,
        userDid: undefined // All activities for this user (sheet is per-user)
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
