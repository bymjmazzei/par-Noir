const raw = import.meta.env.VITE_DEVELOPER_PORTAL_URL;
export const DEVELOPER_PORTAL_URL =
  typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : 'https://developers.parnoir.com';
