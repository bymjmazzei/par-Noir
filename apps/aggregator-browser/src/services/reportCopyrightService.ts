/**
 * Report Copyright Service
 * Submits copyright reports to the API (flows to Prism queue)
 */

import { API_ENDPOINT } from '../config/api';

export async function reportCopyright(
  fileId: string,
  accessToken: string,
  reason?: string
): Promise<void> {
  const res = await fetch(`${API_ENDPOINT}/api/reports`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      fileId,
      reportType: 'copyright',
      reason: reason || undefined,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Failed to submit report');
  }
}
