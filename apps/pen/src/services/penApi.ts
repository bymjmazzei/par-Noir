import { API_ENDPOINT } from '../config/api';
import type { PenNotaryToken } from '@par-noir/pen-protocol';

export async function requestNotaryStamp(
  accessToken: string,
  hash: string
): Promise<PenNotaryToken> {
  const res = await fetch(`${API_ENDPOINT}/api/pen/notary/timestamp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ hash })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'notary_failed');
  }
  return (await res.json()) as PenNotaryToken;
}

export async function fetchTemplates(accessToken: string) {
  const res = await fetch(`${API_ENDPOINT}/api/pen/templates`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error('templates_failed');
  const data = await res.json();
  return data.templates as Array<{
    id: string;
    title: string;
    docType: string;
    description: string;
  }>;
}
