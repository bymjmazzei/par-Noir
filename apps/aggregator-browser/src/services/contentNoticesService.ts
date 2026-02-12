/**
 * Content notices (DMCA / index removal) - in-app only.
 * par Noir does not host content; "taken down" = removed from index only.
 */

import { API_ENDPOINT } from '../config/api';
import { PNOAuthService } from './pnOAuthService';

export interface ContentNotice {
  id: string;
  fileId: string;
  type: 'pending_review' | 'taken_down' | 'restored';
  reason?: string;
  source: string;
  createdAt: string;
}

export interface ContentNoticesResponse {
  notices: ContentNotice[];
}

export async function getContentNotices(): Promise<ContentNotice[]> {
  const accessToken = await PNOAuthService.getValidAccessToken();
  if (!accessToken) return [];
  const res = await fetch(`${API_ENDPOINT}/api/content-notices?limit=50`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];
  const data: ContentNoticesResponse = await res.json();
  return data.notices ?? [];
}
