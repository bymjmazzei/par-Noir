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

export async function fetchContentNotices(
  apiEndpoint: string,
  accessToken: string,
  options: { throwOnError?: boolean } = {}
): Promise<ContentNotice[]> {
  const res = await fetch(`${apiEndpoint}/api/content-notices?limit=50`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    if (options.throwOnError) {
      const err = await res.json().catch(() => ({} as Record<string, string>));
      throw new Error(err.error || 'Failed to load content notices');
    }
    return [];
  }
  const data: ContentNoticesResponse = await res.json();
  return data.notices ?? [];
}

