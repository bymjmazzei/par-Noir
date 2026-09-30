/**
 * Activity ledger from the device Google sheet.
 */

import { listDeviceActivities } from '@par-noir/device-cloud-credentials';
import { sessionDriveFor } from './sessionDrive';

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

export interface ActivityListResponse {
  activities: ActivityEntry[];
  total: number;
  limit: number;
  offset: number;
}

export class ActivityLedgerService {
  /**
   * Get user's activities
   */
  static async getActivities(
    userPnIdentifier: string,
    options?: {
      limit?: number;
      offset?: number;
      activityType?: string;
    }
  ): Promise<ActivityListResponse> {
    const pn = userPnIdentifier.startsWith('pn-') ? userPnIdentifier : `pn-${userPnIdentifier}`;
    const drive = await sessionDriveFor(pn);
    const sheetId = drive.index.sheetIds.activity_ledger;
    const rows = sheetId ? await listDeviceActivities(drive.accessToken, sheetId) : [];
    const filtered = options?.activityType
      ? rows.filter((row) => row.activity_type === options.activityType)
      : rows;
    const offset = options?.offset || 0;
    const limit = options?.limit || 50;
    const page = filtered.slice(offset, offset + limit);
    return {
      activities: page.map((row) => ({
        activity_id: row.activity_id,
        user_did: row.user_pn_identifier,
        activity_type: row.activity_type,
        target_type: row.target_type,
        target_id: row.target_pn_identifier,
        actor_did: row.actor_pn_identifier,
        metadata: row.metadata,
        created_at: row.created_at,
      })),
      total: filtered.length,
      limit,
      offset,
    };
  }
}
