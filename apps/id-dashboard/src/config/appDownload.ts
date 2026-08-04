/** Public download / install landing for native apps (placeholder until stores are live). */
export const APP_DOWNLOAD_URL =
  (typeof import.meta !== 'undefined' &&
    (import.meta as ImportMeta & { env?: { VITE_APP_DOWNLOAD_URL?: string } }).env
      ?.VITE_APP_DOWNLOAD_URL) ||
  'https://parnoir.com/download';
