/**
 * Submit content reports to the par Noir API (same endpoint as aggregator-browser).
 */

import { API_ENDPOINT } from '../config/api';

export async function submitContentReport(
  fileId: string,
  accessToken: string,
  reportType: 'nsfw' | 'spam' | 'copyright' | 'other',
  reason?: string
): Promise<void> {
  const res = await fetch(`${API_ENDPOINT}/api/reports`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      fileId,
      reportType,
      reason: reason || undefined
    })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.error_description || 'Failed to submit report');
  }
}
