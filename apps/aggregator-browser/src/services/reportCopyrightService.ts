/**
 * Report content to the API (flows to Prism queue for copyright / prohibited)
 */

import { API_ENDPOINT } from '../config/api';

export type ContentReportType = 'copyright' | 'prohibited';

export async function reportContent(
  fileId: string,
  accessToken: string,
  reportType: ContentReportType = 'copyright',
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
      reportType,
      reason: reason || undefined,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Failed to submit report');
  }
}

/** @deprecated Prefer reportContent(..., 'copyright') */
export async function reportCopyright(
  fileId: string,
  accessToken: string,
  reason?: string
): Promise<void> {
  return reportContent(fileId, accessToken, 'copyright', reason);
}
