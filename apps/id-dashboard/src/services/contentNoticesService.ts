/**
 * Content notices (DMCA / index removal) - in-app only.
 * par Noir does not host content; "taken down" = removed from index only.
 */

import { API_ENDPOINT } from '../config/api';
import { fetchContentNotices, type ContentNotice } from '@par-noir/aggregator-domain';

export type { ContentNotice } from '@par-noir/aggregator-domain';

export async function getContentNotices(accessToken: string): Promise<ContentNotice[]> {
  return fetchContentNotices(API_ENDPOINT, accessToken, { throwOnError: true });
}
