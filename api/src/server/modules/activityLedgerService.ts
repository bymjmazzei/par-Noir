/**
 * Activity Ledger Service
 * Records all user activities chronologically
 * Stored in Google Drive (decentralized) - users own their data
 * Uses Google Sheets for better performance and querying
 */

import crypto from 'crypto';
import { ActivityLedgerSheetsService, ActivityEntry as SheetsActivityEntry } from './activityLedgerSheetsService';
import { GoogleDriveToken } from './googleOAuth2Helper';
import { isPortableStorageProvider } from './storage/storageProviderUtils';
import { portableTableAppend, portableTableScan } from './storage/portableTableService';
import { ACTIVITY_LEDGER_SCHEMA } from './storage/tableSchemas';

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
    token: GoogleDriveToken | string,
    metadataFolderId: string,
    userPnIdentifier: string,
    activityType: ActivityType,
    options?: {
      targetType?: string;
      targetPnIdentifier?: string; // pn-identifier when targetType is 'user', otherwise the target ID
      actorPnIdentifier?: string;
      metadata?: any;
    },
    accountId?: string
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

      if (await isPortableStorageProvider(normalizedUserPnIdentifier)) {
        await portableTableAppend(
          normalizedUserPnIdentifier,
          ACTIVITY_LEDGER_SCHEMA,
          activity as unknown as Record<string, unknown>,
          accountId
        );
        return activity;
      }

      const tokenObj: GoogleDriveToken = typeof token === 'string' 
        ? { access_token: token }
        : token;

      const spreadsheetId = await ActivityLedgerSheetsService.getActivityLedgerSheet(
        tokenObj,
        metadataFolderId,
        normalizedUserPnIdentifier,
        accountId
      );

      await ActivityLedgerSheetsService.appendActivity(tokenObj, spreadsheetId, activity, normalizedUserPnIdentifier, accountId);

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
    token: GoogleDriveToken | string,
    metadataFolderId: string,
    userPnIdentifier: string,
    accountId?: string,
    options?: {
      limit?: number;
      offset?: number;
      activityType?: ActivityType;
    }
  ): Promise<{ activities: ActivityEntry[]; total: number }> {
    try {
      const normalizedUserPnIdentifier = this.normalizeToPnIdentifier(userPnIdentifier);

      if (await isPortableStorageProvider(normalizedUserPnIdentifier)) {
        let activities = await portableTableScan<ActivityEntry>(
          normalizedUserPnIdentifier,
          ACTIVITY_LEDGER_SCHEMA,
          accountId
        );
        if (options?.activityType) {
          activities = activities.filter((a) => a.activity_type === options.activityType);
        }
        const total = activities.length;
        const limit = options?.limit ?? activities.length;
        const offset = options?.offset ?? 0;
        return { activities: activities.slice(offset, offset + limit), total };
      }

      const tokenObj: GoogleDriveToken = typeof token === 'string' 
        ? { access_token: token }
        : token;

      const spreadsheetId = await ActivityLedgerSheetsService.getActivityLedgerSheet(
        tokenObj,
        metadataFolderId,
        normalizedUserPnIdentifier,
        accountId
      );

      // Get activities from sheet
      const result = await ActivityLedgerSheetsService.getActivities(tokenObj, spreadsheetId, normalizedUserPnIdentifier, accountId, {
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
