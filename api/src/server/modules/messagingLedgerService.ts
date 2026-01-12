/**
 * Messaging Ledger Service
 * Records messaging activities separately from general activity ledger
 * Uses messaging_ledger.xlsx (Google Sheets) for better scalability
 * Migrates from messaging_ledger.json automatically on first access
 */

import { MessagingLedgerSheetsService, MessagingActivityEntry } from './messagingLedgerSheetsService';

export interface MessagingActivityEntry {
  message_activity_id: string;
  user_did: string;
  activity_type: 'message_sent' | 'message_received' | 'message_read' | 'thread_created';
  from_did?: string;
  to_did?: string;
  message_id?: string;
  thread_id?: string;
  metadata?: any;
  created_at: string;
}

export interface MessagingLedgerFile {
  identifier: string;
  updatedAt: string;
  activities: MessagingActivityEntry[];
}

export class MessagingLedgerService {
  private static readonly MESSAGING_LEDGER_FILE_NAME = 'messaging_ledger.json';

  /**
   * Migrate from JSON to Sheets if JSON exists
   */
  private static async migrateFromJsonIfNeeded(
    accessToken: string,
    metadataFolderId: string
  ): Promise<void> {
    try {
      // Check if JSON file exists
      const searchQuery = `name='${this.MESSAGING_LEDGER_FILE_NAME}' and '${metadataFolderId}' in parents and trashed=false`;
      const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQuery)}&fields=files(id)&pageSize=1`;
      
      const searchResponse = await fetch(searchUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (!searchResponse.ok) {
        return; // No JSON file, nothing to migrate
      }

      const searchData = await searchResponse.json() as { files?: Array<{ id: string }> };
      if (!searchData.files || searchData.files.length === 0) {
        return; // No JSON file
      }

      // Download JSON file
      const fileId = searchData.files[0].id;
      const getResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );

      if (!getResponse.ok) {
        return;
      }

      const jsonData = await getResponse.json() as MessagingLedgerFile;
      
      // Get or create Sheets file
      const spreadsheetId = await MessagingLedgerSheetsService.getOrCreateMessagingLedgerSheet(
        accessToken,
        metadataFolderId
      );

      // Migrate all activities
      for (const activity of jsonData.activities || []) {
        await MessagingLedgerSheetsService.appendActivity(accessToken, spreadsheetId, activity);
      }

      console.log('[MessagingLedgerService] Migrated messaging_ledger.json to messaging_ledger.xlsx');
    } catch (error) {
      console.error('[MessagingLedgerService] Error migrating from JSON:', error);
      // Don't throw - continue with Sheets even if migration fails
    }
  }

  /**
   * Get messaging ledger file from user's Google Drive (now uses Sheets)
   */
  static async getMessagingLedgerFile(
    accessToken: string,
    metadataFolderId: string,
    identifier?: string
  ): Promise<MessagingLedgerFile | null> {
    try {
      // Migrate from JSON if needed
      await this.migrateFromJsonIfNeeded(accessToken, metadataFolderId);

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
   * Create or update messaging ledger file (now uses Sheets)
   * Note: This method is kept for backward compatibility but now delegates to Sheets operations
   */
  static async updateMessagingLedgerFile(
    accessToken: string,
    metadataFolderId: string,
    identifier: string,
    ledgerData: MessagingLedgerFile
  ): Promise<void> {
    // Migrate from JSON if needed
    await this.migrateFromJsonIfNeeded(accessToken, metadataFolderId);

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
    // Migrate from JSON if needed
    await this.migrateFromJsonIfNeeded(accessToken, metadataFolderId);

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
    // Migrate from JSON if needed
    await this.migrateFromJsonIfNeeded(accessToken, metadataFolderId);

    // Get or create Sheets file
    const spreadsheetId = await MessagingLedgerSheetsService.getOrCreateMessagingLedgerSheet(
      accessToken,
      metadataFolderId
    );

    // Get activities from Sheets
    return await MessagingLedgerSheetsService.getActivities(accessToken, spreadsheetId, options);
  }
}
