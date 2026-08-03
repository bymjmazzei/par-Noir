import { API_ENDPOINT } from '../config/api';

export interface DriveNotification {
  notification_id: string;
  user_pn_identifier?: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

function authHeaders(authToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json',
  };
}

export async function fetchDriveNotifications(
  userPnIdentifier: string,
  authToken: string,
  options?: { limit?: number; unreadOnly?: boolean; type?: string }
): Promise<{ notifications: DriveNotification[]; total: number }> {
  const params = new URLSearchParams();
  params.set('userPnIdentifier', userPnIdentifier);
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.unreadOnly) params.set('unreadOnly', 'true');
  if (options?.type) params.set('type', options.type);

  const res = await fetch(`${API_ENDPOINT}/api/notifications?${params.toString()}`, {
    headers: authHeaders(authToken),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error_description?: string; error?: string }).error_description ||
        (err as { error?: string }).error ||
        'Failed to fetch notifications'
    );
  }
  return res.json();
}

export async function markDriveNotificationRead(
  notificationId: string,
  userPnIdentifier: string,
  authToken: string
): Promise<void> {
  const res = await fetch(
    `${API_ENDPOINT}/api/notifications/${encodeURIComponent(notificationId)}/read`,
    {
      method: 'PUT',
      headers: authHeaders(authToken),
      body: JSON.stringify({ userPnIdentifier }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error_description?: string; error?: string }).error_description ||
        (err as { error?: string }).error ||
        'Failed to mark notification read'
    );
  }
}
