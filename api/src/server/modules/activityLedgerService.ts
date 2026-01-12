/**
 * Activity Ledger Service
 * Records all user activities chronologically
 * Stored in Google Drive (decentralized) - users own their data
 */

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

export interface ActivityLedgerFile {
  identifier: string;
  updatedAt: string;
  activities: ActivityEntry[];
}

export class ActivityLedgerService {
  private static readonly ACTIVITY_LEDGER_FILE_NAME = 'activity_ledger.json';

  /**
   * Get activity ledger file from user's Google Drive
   */
  static async getActivityLedgerFile(
    accessToken: string,
    metadataFolderId: string
  ): Promise<ActivityLedgerFile | null> {
    try {
      // Search for activity_ledger.json in metadata folder
      const searchQuery = `name='${this.ACTIVITY_LEDGER_FILE_NAME}' and '${metadataFolderId}' in parents and trashed=false`;
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

      // Download activity ledger file
      const fileId = searchData.files[0].id;
      const getResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );

      if (!getResponse.ok) {
        return null;
      }

      try {
        return await getResponse.json() as ActivityLedgerFile;
      } catch {
        return null;
      }
    } catch (error) {
      console.error('Error getting activity ledger file:', error);
      return null;
    }
  }

  /**
   * Create or update activity ledger file
   */
  static async updateActivityLedgerFile(
    accessToken: string,
    metadataFolderId: string,
    identifier: string,
    ledgerData: ActivityLedgerFile
  ): Promise<void> {
    const ledgerContent = JSON.stringify(ledgerData, null, 2);

    try {
      // Search for existing activity_ledger.json
      const searchQuery = `name='${this.ACTIVITY_LEDGER_FILE_NAME}' and '${metadataFolderId}' in parents and trashed=false`;
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
        name: this.ACTIVITY_LEDGER_FILE_NAME,
        parents: [metadataFolderId]
      });

      const multipartBody = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="metadata"',
        'Content-Type: application/json',
        '',
        metadataPart,
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="activity_ledger.json"',
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
      console.error('Error updating activity ledger file:', error);
      throw error;
    }
  }

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
    const activityId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Get or create ledger file
    let ledgerFile = await this.getActivityLedgerFile(accessToken, metadataFolderId);
    if (!ledgerFile) {
      ledgerFile = {
        identifier: userDid,
        updatedAt: now,
        activities: []
      };
    }

    // Create activity entry
    const activity: ActivityEntry = {
      activity_id: activityId,
      user_did: userDid,
      activity_type: activityType,
      target_type: options?.targetType || undefined,
      target_id: options?.targetId || undefined,
      actor_did: options?.actorDid || undefined,
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
    await this.updateActivityLedgerFile(accessToken, metadataFolderId, userDid, ledgerFile);

    return activity;
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
    const ledgerFile = await this.getActivityLedgerFile(accessToken, metadataFolderId);
    
    if (!ledgerFile) {
      return { activities: [], total: 0 };
    }

    let activities = [...ledgerFile.activities];

    // Filter by activity type if specified
    if (options?.activityType) {
      activities = activities.filter(a => a.activity_type === options.activityType);
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
