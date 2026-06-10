/**
 * Messaging Ledger Service
 * Records messaging activities separately from general activity ledger
 * Uses messaging_ledger.xlsx (Google Sheets) for better scalability
 */

import * as crypto from 'crypto';
import { MessagingLedgerSheetsService, MessagingActivityEntry } from './messagingLedgerSheetsService';
import { GoogleDriveToken } from './googleOAuth2Helper';
import { isPortableStorageProvider } from './storage/storageProviderUtils';
import { portableTableAppend, portableTableScan } from './storage/portableTableService';
import { MESSAGING_LEDGER_SCHEMA } from './storage/tableSchemas';

// Re-export MessagingActivityEntry for backward compatibility
export type { MessagingActivityEntry };

export interface MessagingLedgerFile {
  identifier: string;
  updatedAt: string;
  activities: MessagingActivityEntry[];
}

export class MessagingLedgerService {
  /**
   * Normalize identifier to pn-identifier format
   */
  private static normalizeToPnIdentifier(did: string): string {
    return did.startsWith('pn-') ? did : `pn-${did}`;
  }

  /**
   * Get messaging ledger file from user's Google Drive (uses Sheets)
   */
  static async getMessagingLedgerFile(
    token: GoogleDriveToken | string,
    metadataFolderId: string,
    userPnIdentifier: string,
    accountId?: string,
    identifier?: string
  ): Promise<MessagingLedgerFile | null> {
    try {
      const normalizedUserPnIdentifier = this.normalizeToPnIdentifier(userPnIdentifier);

      if (await isPortableStorageProvider(normalizedUserPnIdentifier)) {
        const activities = await portableTableScan<MessagingActivityEntry>(
          normalizedUserPnIdentifier,
          MESSAGING_LEDGER_SCHEMA,
          accountId
        );
        const normalizedIdentifier = identifier ? this.normalizeToPnIdentifier(identifier) : '';
        return {
          identifier: normalizedIdentifier,
          updatedAt: new Date().toISOString(),
          activities
        };
      }

      const tokenObj: GoogleDriveToken = typeof token === 'string' ? { access_token: token } : token;

      const spreadsheetId = await MessagingLedgerSheetsService.getMessagingLedgerSheet(
        tokenObj,
        metadataFolderId,
        userPnIdentifier,
        accountId
      );

      const { activities } = await MessagingLedgerSheetsService.getActivities(
        tokenObj,
        spreadsheetId,
        userPnIdentifier,
        accountId
      );

      // Normalize identifier if provided (handles legacy data)
      const normalizedIdentifier = identifier ? this.normalizeToPnIdentifier(identifier) : '';
      return {
        identifier: normalizedIdentifier,
        updatedAt: new Date().toISOString(),
        activities
      };
    } catch (error) {
      console.error('Error getting messaging ledger file:', error);
      return null;
    }
  }

  /**
   * Create or update messaging ledger file (uses Sheets)
   */
  static async updateMessagingLedgerFile(
    accessToken: string,
    metadataFolderId: string,
    identifier: string,
    ledgerData: MessagingLedgerFile,
    userPnIdentifier: string,
    accountId?: string
  ): Promise<void> {
    // Convert accessToken string to token object
    const token: GoogleDriveToken = { access_token: accessToken };
    const normalizedUserPnIdentifier = this.normalizeToPnIdentifier(userPnIdentifier);

    // Get or create Sheets file
    const spreadsheetId = await MessagingLedgerSheetsService.getMessagingLedgerSheet(
      token,
      metadataFolderId,
      normalizedUserPnIdentifier,
      accountId
    );

    // Append new activities (if any)
    // Note: This doesn't handle full replacement - activities are append-only in Sheets
    // If full replacement is needed, we'd need to clear and re-add, but that's not typical usage
    for (const activity of ledgerData.activities || []) {
      await MessagingLedgerSheetsService.appendActivity(token, spreadsheetId, activity, normalizedUserPnIdentifier, accountId);
    }
  }

  /**
   * Record a messaging activity
   */
  static async recordMessagingActivity(
    accessToken: string,
    metadataFolderId: string,
    userPnIdentifier: string,
    activityType: MessagingActivityEntry['activity_type'],
    options?: {
      fromPnIdentifier?: string;
      toPnIdentifier?: string;
      messageId?: string;
      threadId?: string;
      metadata?: any;
    },
    accountId?: string
  ): Promise<MessagingActivityEntry> {
    // Normalize all pn-identifiers (handles legacy data)
    const normalizedUserPnIdentifier = this.normalizeToPnIdentifier(userPnIdentifier);
    const normalizedFromPnIdentifier = options?.fromPnIdentifier ? this.normalizeToPnIdentifier(options.fromPnIdentifier) : undefined;
    const normalizedToPnIdentifier = options?.toPnIdentifier ? this.normalizeToPnIdentifier(options.toPnIdentifier) : undefined;

    const activityId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Create activity entry
    const activity: MessagingActivityEntry = {
      message_activity_id: activityId,
      user_pn_identifier: normalizedUserPnIdentifier,
      activity_type: activityType,
      from_pn_identifier: normalizedFromPnIdentifier,
      to_pn_identifier: normalizedToPnIdentifier,
      message_id: options?.messageId || undefined,
      thread_id: options?.threadId || undefined,
      metadata: options?.metadata || {},
      created_at: now
    };

    if (await isPortableStorageProvider(normalizedUserPnIdentifier)) {
      await portableTableAppend(
        normalizedUserPnIdentifier,
        MESSAGING_LEDGER_SCHEMA,
        activity as unknown as Record<string, unknown>,
        accountId
      );
      return activity;
    }

    const token: GoogleDriveToken = { access_token: accessToken };

    const spreadsheetId = await MessagingLedgerSheetsService.getMessagingLedgerSheet(
      token,
      metadataFolderId,
      normalizedUserPnIdentifier,
      accountId
    );

    await MessagingLedgerSheetsService.appendActivity(token, spreadsheetId, activity, normalizedUserPnIdentifier, accountId);

    return activity;
  }

  /**
   * Get messaging activities for a user
   */
  static async getUserMessagingActivities(
    accessToken: string,
    metadataFolderId: string,
    userPnIdentifier: string,
    accountId?: string,
    options?: {
      limit?: number;
      offset?: number;
      activityType?: MessagingActivityEntry['activity_type'];
      threadId?: string;
    }
  ): Promise<{ activities: MessagingActivityEntry[]; total: number }> {
    const normalizedUserPnIdentifier = this.normalizeToPnIdentifier(userPnIdentifier);

    if (await isPortableStorageProvider(normalizedUserPnIdentifier)) {
      let activities = await portableTableScan<MessagingActivityEntry>(
        normalizedUserPnIdentifier,
        MESSAGING_LEDGER_SCHEMA,
        accountId
      );
      if (options?.activityType) {
        activities = activities.filter((a) => a.activity_type === options.activityType);
      }
      if (options?.threadId) {
        activities = activities.filter((a) => a.thread_id === options.threadId);
      }
      const total = activities.length;
      const limit = options?.limit ?? activities.length;
      const offset = options?.offset ?? 0;
      return { activities: activities.slice(offset, offset + limit), total };
    }

    const token: GoogleDriveToken = { access_token: accessToken };

    const spreadsheetId = await MessagingLedgerSheetsService.getMessagingLedgerSheet(
      token,
      metadataFolderId,
      normalizedUserPnIdentifier,
      accountId
    );

    return await MessagingLedgerSheetsService.getActivities(token, spreadsheetId, normalizedUserPnIdentifier, accountId, options);
  }
}
