/**
 * Minimal central metadata index client for Pen templates feed.
 * Uses @par-noir/aggregator-domain path constants — does not import aggregator-browser.
 */

import {
  CENTRAL_INDEX_PATH,
  type CentralIndexEntry,
  type CentralIndexResponse
} from '@par-noir/aggregator-domain';
import { API_ENDPOINT } from '../config/api';
import { onlyPenTemplates } from './penTemplateFeed';

export async function fetchPublicPenTemplates(opts?: {
  limit?: number;
  offset?: number;
}): Promise<CentralIndexEntry[]> {
  const params = new URLSearchParams();
  params.set('limit', String(opts?.limit ?? 100));
  if (opts?.offset != null) params.set('offset', String(opts.offset));

  const res = await fetch(`${API_ENDPOINT}${CENTRAL_INDEX_PATH}?${params.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' }
  });
  if (!res.ok) throw new Error(`metadata_index_${res.status}`);
  const data = (await res.json()) as CentralIndexResponse;
  const files = Array.isArray(data.files) ? data.files : [];
  return onlyPenTemplates(files);
}
