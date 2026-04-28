/**
 * Content notices (DMCA / index removal) - in-app only.
 * par Noir does not host content; "taken down" = removed from index only.
 */

import { API_ENDPOINT } from '../config/api';
import { PNOAuthService } from './pnOAuthService';
import { fetchContentNotices, type ContentNotice } from '@par-noir/aggregator-domain';

export async function getContentNotices(): Promise<ContentNotice[]> {
  const accessToken = await PNOAuthService.getValidAccessToken();
  if (!accessToken) return [];
  return fetchContentNotices(API_ENDPOINT, accessToken);
}
