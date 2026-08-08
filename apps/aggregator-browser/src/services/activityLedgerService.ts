/**
 * Activity Ledger Service (Frontend)
 * Handles fetching activity ledger data from the API
 */

import { getOwnerApiHeaders } from './ownerApiHeaders';
import { API_ENDPOINT } from '../config/api';

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

function getAuthHeaders(): HeadersInit {
  return getOwnerApiHeaders();
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
    const params = new URLSearchParams();
    params.append('userPnIdentifier', userPnIdentifier);
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());
    if (options?.activityType) params.append('activityType', options.activityType);

    const response = await fetch(`${API_ENDPOINT}/api/activity-ledger?${params.toString()}`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to get activities' }));
      throw new Error(error.error_description || error.error || 'Failed to get activities');
    }

    const data = await response.json();
    return {
      activities: data.activities || [],
      total: data.total || 0,
      limit: options?.limit || 50,
      offset: options?.offset || 0
    };
  }
}
