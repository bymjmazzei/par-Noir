import { API_ENDPOINT } from './api';

/**
 * Returns the Google Drive OAuth client ID for the dashboard.
 * Uses VITE_GOOGLE_DRIVE_CLIENT_ID at build time when set; otherwise
 * fetches from API /api/public-config so deploys don't depend on .env.
 */
export async function getGoogleDriveClientId(): Promise<string> {
  const fromEnv = import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID;
  if (fromEnv && typeof fromEnv === 'string' && fromEnv.trim() !== '') {
    return fromEnv.trim();
  }
  try {
    const res = await fetch(`${API_ENDPOINT}/api/public-config`);
    if (!res.ok) return '';
    const data = (await res.json()) as { googleDriveClientId?: string };
    return (data.googleDriveClientId && String(data.googleDriveClientId).trim()) || '';
  } catch {
    return '';
  }
}
