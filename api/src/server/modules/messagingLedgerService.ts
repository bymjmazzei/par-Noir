/**
 * Messaging Ledger Service
 * Records messaging activities separately from general activity ledger
 * Stored in Google Drive (decentralized) - users own their data
 */

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
   * Get messaging ledger file from user's Google Drive
   */
  static async getMessagingLedgerFile(
    accessToken: string,
    metadataFolderId: string
  ): Promise<MessagingLedgerFile | null> {
    try {
      // Search for messaging_ledger.json in metadata folder
      const searchQuery = `name='${this.MESSAGING_LEDGER_FILE_NAME}' and '${metadataFolderId}' in parents and trashed=false`;
      const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQuery)}&fields=files(id)&pageSize=1`;
      
      const searchResponse = await fetch(searchUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (!searchResponse.ok || searchResponse.status === 404) {
        return null;
      }

      const searchData = await searchResponse.json() as { files?: Array<{ id: string }> };
      
      if (!searchData.files || searchData.files.length === 0) {
        return null;
      }

      // Download messaging ledger file
      const fileId = searchData.files[0].id;
      const getResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );

      if (!getResponse.ok) {
        return null;
      }

      try {
        return await getResponse.json() as MessagingLedgerFile;
      } catch {
        return null;
      }
    } catch (error) {
      console.error('Error getting messaging ledger file:', error);
      return null;
    }
  }

  /**
   * Create or update messaging ledger file
   */
  static async updateMessagingLedgerFile(
    accessToken: string,
    metadataFolderId: string,
    identifier: string,
    ledgerData: MessagingLedgerFile
  ): Promise<void> {
    const ledgerContent = JSON.stringify(ledgerData, null, 2);

    try {
      // Search for existing messaging_ledger.json
      const searchQuery = `name='${this.MESSAGING_LEDGER_FILE_NAME}' and '${metadataFolderId}' in parents and trashed=false`;
      const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQuery)}&fields=files(id)&pageSize=1`;
      
      const searchResponse = await fetch(searchUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (searchResponse.ok) {
        const searchData = await searchResponse.json() as { files?: Array<{ id: string }> };
        
        if (searchData.files && searchData.files.length > 0) {
          // Update existing file
          const fileId = searchData.files[0].id;
          await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json; charset=UTF-8'
            },
            body: ledgerContent
          });
          return;
        }
      }

      // Create new file
      const boundary = `----WebKitFormBoundary${Date.now()}`;
      const metadataPart = JSON.stringify({
        name: this.MESSAGING_LEDGER_FILE_NAME,
        parents: [metadataFolderId]
      });

      const multipartBody = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="metadata"',
        'Content-Type: application/json',
        '',
        metadataPart,
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="messaging_ledger.json"',
        'Content-Type: application/json',
        '',
        ledgerContent,
        `--${boundary}--`
      ].join('\r\n');

      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`
        },
        body: multipartBody
      });
    } catch (error) {
      console.error('Error updating messaging ledger file:', error);
      throw error;
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

    // Get or create ledger file
    let ledgerFile = await this.getMessagingLedgerFile(accessToken, metadataFolderId);
    if (!ledgerFile) {
      ledgerFile = {
        identifier: userDid,
        updatedAt: now,
        activities: []
      };
    }

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

    // Add to activities (keep only last 10,000 activities)
    ledgerFile.activities.push(activity);
    if (ledgerFile.activities.length > 10000) {
      ledgerFile.activities = ledgerFile.activities.slice(-10000);
    }
    ledgerFile.updatedAt = now;

    // Update file
    await this.updateMessagingLedgerFile(accessToken, metadataFolderId, userDid, ledgerFile);

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
    const ledgerFile = await this.getMessagingLedgerFile(accessToken, metadataFolderId);
    
    if (!ledgerFile) {
      return { activities: [], total: 0 };
    }

    let activities = [...ledgerFile.activities];

    // Filter by activity type if specified
    if (options?.activityType) {
      activities = activities.filter(a => a.activity_type === options.activityType);
    }

    // Filter by thread ID if specified
    if (options?.threadId) {
      activities = activities.filter(a => a.thread_id === options.threadId);
    }

    // Sort by created_at descending (most recent first)
    activities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const total = activities.length;
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    // Apply pagination
    const paginatedActivities = activities.slice(offset, offset + limit);

    return {
      activities: paginatedActivities,
      total
    };
  }
}
