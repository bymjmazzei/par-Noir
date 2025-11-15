/**
 * Creator Subscriber Storage Service
 * Stores subscriber information on creator's Google Drive
 * Creator hosts subscriber list, subscriber stores local reference
 */

// import { google } from 'googleapis'; // Optional dependency - only needed if Google Drive sync is enabled

export interface SubscriberInfo {
  subscriberDid: string;
  feedId: string;
  subscribedAt: string;
}

export interface CreatorSubscriberList {
  creatorDid: string;
  feedId: string;
  subscribers: SubscriberInfo[];
  updatedAt: string;
}

export class CreatorSubscriberStorage {
  /**
   * Store subscriber info on creator's Google Drive
   * Creates/updates a subscribers.json file in creator's par-noir-media folder
   */
  static async storeSubscriberOnCreatorDrive(
    creatorDid: string,
    feedId: string,
    subscriberDid: string,
    creatorGoogleTokens?: { access_token: string; refresh_token?: string }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // If creator doesn't have Google Drive tokens, skip (they'll sync later)
      if (!creatorGoogleTokens) {
        console.log(`Creator ${creatorDid} doesn't have Google Drive connected, skipping Drive storage`);
        return { success: true }; // Not an error, just deferred
      }

      // Dynamic import of googleapis (optional dependency)
      const { google } = await import('googleapis');
      
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_DRIVE_CLIENT_ID,
        process.env.GOOGLE_DRIVE_CLIENT_SECRET
      );

      oauth2Client.setCredentials(creatorGoogleTokens);

      const drive = google.drive({ version: 'v3', auth: oauth2Client });

      // Get or create par-noir-media folder
      const folderId = await this.getOrCreateParNoirFolder(drive);

      // Get or create subscribers file for this feed
      const fileName = `feed-${feedId}-subscribers.json`;
      const fileId = await this.getOrCreateSubscribersFile(drive, folderId, fileName, feedId, creatorDid);

      // Read current subscribers
      const currentSubscribers = await this.readSubscribersFile(drive, fileId);

      // Add new subscriber (or update if exists)
      const subscriberInfo: SubscriberInfo = {
        subscriberDid,
        feedId,
        subscribedAt: new Date().toISOString()
      };

      const updatedSubscribers = [
        ...currentSubscribers.filter(sub => sub.subscriberDid !== subscriberDid),
        subscriberInfo
      ];

      // Write updated subscribers back
      await this.writeSubscribersFile(drive, fileId, {
        creatorDid,
        feedId,
        subscribers: updatedSubscribers,
        updatedAt: new Date().toISOString()
      });

      // Update database to mark as synced
      const { getDatabasePool } = await import('../utils/database');
      const db = getDatabasePool();
      await db.query(`
        UPDATE creator_subscriber_index
        SET synced_to_drive = TRUE
        WHERE creator_did = $1 AND subscriber_did = $2 AND feed_id = $3
      `, [creatorDid, subscriberDid, feedId]);

      return { success: true };
    } catch (error) {
      console.error('Failed to store subscriber on creator Google Drive:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Remove subscriber from creator's Google Drive
   */
  static async removeSubscriberFromCreatorDrive(
    creatorDid: string,
    feedId: string,
    subscriberDid: string,
    creatorGoogleTokens?: { access_token: string; refresh_token?: string }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!creatorGoogleTokens) {
        return { success: true }; // Skip if creator doesn't have Drive connected
      }

      // Dynamic import of googleapis (optional dependency)
      const { google } = await import('googleapis');
      
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_DRIVE_CLIENT_ID,
        process.env.GOOGLE_DRIVE_CLIENT_SECRET
      );

      oauth2Client.setCredentials(creatorGoogleTokens);
      const drive = google.drive({ version: 'v3', auth: oauth2Client });

      const folderId = await this.getOrCreateParNoirFolder(drive);
      const fileName = `feed-${feedId}-subscribers.json`;
      const fileId = await this.getOrCreateSubscribersFile(drive, folderId, fileName, feedId, creatorDid);

      // Read current subscribers
      const currentSubscribers = await this.readSubscribersFile(drive, fileId);

      // Remove subscriber
      const updatedSubscribers = currentSubscribers.filter(sub => sub.subscriberDid !== subscriberDid);

      // Write updated subscribers back
      await this.writeSubscribersFile(drive, fileId, {
        creatorDid,
        feedId,
        subscribers: updatedSubscribers,
        updatedAt: new Date().toISOString()
      });

      // Note: If subscriber was removed, they're no longer in the index, so no DB update needed
      // The removal from database happens in FeedService.unsubscribeFromFeed

      return { success: true };
    } catch (error) {
      console.error('Failed to remove subscriber from creator Google Drive:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get or create par-noir-media folder
   */
  private static async getOrCreateParNoirFolder(drive: any): Promise<string> {
    const folderQuery = "name='par-noir-media' and mimeType='application/vnd.google-apps.folder' and trashed=false";
    const folderResponse = await drive.files.list({
      q: folderQuery,
      fields: 'files(id,name)'
    });

    if (folderResponse.data.files.length > 0) {
      return folderResponse.data.files[0].id;
    }

    // Create folder
    const folderMetadata = {
      name: 'par-noir-media',
      mimeType: 'application/vnd.google-apps.folder'
    };
    const folder = await drive.files.create({
      resource: folderMetadata,
      fields: 'id'
    });

    return folder.data.id;
  }

  /**
   * Get or create subscribers file
   */
  private static async getOrCreateSubscribersFile(
    drive: any,
    folderId: string,
    fileName: string,
    feedId: string,
    creatorDid: string
  ): Promise<string> {
    const fileQuery = `name='${fileName}' and '${folderId}' in parents and trashed=false`;
    const fileResponse = await drive.files.list({
      q: fileQuery,
      fields: 'files(id,name)'
    });

    if (fileResponse.data.files.length > 0) {
      return fileResponse.data.files[0].id;
    }

    // Create new file with empty subscribers list
    const initialData: CreatorSubscriberList = {
      creatorDid,
      feedId,
      subscribers: [],
      updatedAt: new Date().toISOString()
    };

    const fileMetadata = {
      name: fileName,
      parents: [folderId]
    };

    const media = {
      mimeType: 'application/json',
      body: JSON.stringify(initialData, null, 2)
    };

    const file = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id'
    });

    return file.data.id;
  }

  /**
   * Read subscribers file
   */
  private static async readSubscribersFile(drive: any, fileId: string): Promise<SubscriberInfo[]> {
    try {
      const response = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'text' }
      );

      const data: CreatorSubscriberList = JSON.parse(response.data);
      return data.subscribers || [];
    } catch (error) {
      console.warn('Failed to read subscribers file, returning empty list:', error);
      return [];
    }
  }

  /**
   * Write subscribers file
   */
  private static async writeSubscribersFile(
    drive: any,
    fileId: string,
    data: CreatorSubscriberList
  ): Promise<void> {
    await drive.files.update({
      fileId: fileId,
      media: {
        mimeType: 'application/json',
        body: JSON.stringify(data, null, 2)
      }
    });
  }
}

