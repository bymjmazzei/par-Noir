/**
 * Messaging Ledger Service
 * Records messaging activities separately from general activity ledger
 * Uses messaging_ledger.xlsx (Google Sheets) for better scalability
 */

import * as crypto from 'crypto';
import { MessagingLedgerSheetsService, MessagingActivityEntry } from './messagingLedgerSheetsService';

// Re-export MessagingActivityEntry for backward compatibility
export type { MessagingActivityEntry };

export interface MessagingLedgerFile {
  identifier: string;
  updatedAt: string;
  activities: MessagingActivityEntry[];
}

export class MessagingLedgerService {

  /**
   * Get messaging ledger file from user's Google Drive (uses Sheets)
   */
  static async getMessagingLedgerFile(
    accessToken: string,
    metadataFolderId: string,
    identifier?: string
  ): Promise<MessagingLedgerFile | null> {
    try {

      // Get or create Sheets file
      const spreadsheetId = await MessagingLedgerSheetsService.getOrCreateMessagingLedgerSheet(
        accessToken,
        metadataFolderId
      );

      // Get all activities
      const { activities } = await MessagingLedgerSheetsService.getActivities(
        accessToken,
        spreadsheetId
      );

      return {
        identifier: identifier || '',
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
    ledgerData: MessagingLedgerFile
  ): Promise<void> {

    // Get or create Sheets file
    const spreadsheetId = await MessagingLedgerSheetsService.getOrCreateMessagingLedgerSheet(
      accessToken,
      metadataFolderId
    );

    // Append new activities (if any)
    // Note: This doesn't handle full replacement - activities are append-only in Sheets
    // If full replacement is needed, we'd need to clear and re-add, but that's not typical usage
    for (const activity of ledgerData.activities || []) {
      await MessagingLedgerSheetsService.appendActivity(accessToken, spreadsheetId, activity);
    }
  }

  /**
   * Record a messaging activity
   */
  static async recordMessagingActivity(
    accessToken: string,
    metadataFolderId: string,
    userDid: string,
    activityType: MessagingActivityEntry['activity_type'],
    options?: {
      fromDid?: string;
      toDid?: string;
      messageId?: string;
      threadId?: string;
      metadata?: any;
    }
  ): Promise<MessagingActivityEntry> {

    const activityId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Create activity entry
    const activity: MessagingActivityEntry = {
      message_activity_id: activityId,
      user_did: userDid,
      activity_type: activityType,
      from_did: options?.fromDid || undefined,
      to_did: options?.toDid || undefined,
      message_id: options?.messageId || undefined,
      thread_id: options?.threadId || undefined,
      metadata: options?.metadata || {},
      created_at: now
    };

    // Get or create Sheets file
    const spreadsheetId = await MessagingLedgerSheetsService.getOrCreateMessagingLedgerSheet(
      accessToken,
      metadataFolderId
    );

    // Append activity (no 10,000 limit - Sheets can handle millions)
    await MessagingLedgerSheetsService.appendActivity(accessToken, spreadsheetId, activity);

    return activity;
  }

  /**
   * Get messaging activities for a user
   */
  static async getUserMessagingActivities(
    accessToken: string,
    metadataFolderId: string,
    options?: {
      limit?: number;
      offset?: number;
      activityType?: MessagingActivityEntry['activity_type'];
      threadId?: string;
    }
  ): Promise<{ activities: MessagingActivityEntry[]; total: number }> {

    // Get or create Sheets file
    const spreadsheetId = await MessagingLedgerSheetsService.getOrCreateMessagingLedgerSheet(
      accessToken,
      metadataFolderId
    );

    // Get activities from Sheets
    return await MessagingLedgerSheetsService.getActivities(accessToken, spreadsheetId, options);
  }
}
