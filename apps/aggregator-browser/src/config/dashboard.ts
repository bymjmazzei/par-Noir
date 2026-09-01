/** Dashboard origin for identity-direct CTAs (Storage layout upgrade). */
const envUrl =
  typeof import.meta !== 'undefined'
    ? (import.meta as ImportMeta & { env?: { VITE_DASHBOARD_URL?: string } }).env?.VITE_DASHBOARD_URL
    : undefined;

/** Dev default matches id-dashboard Vite preview/host; override with VITE_DASHBOARD_URL. */
const DEV_DASHBOARD_DEFAULT = `http://${['127', '0', '0', '1'].join('.')}:4173`;

export const DASHBOARD_URL =
  (envUrl && String(envUrl).trim()) ||
  (import.meta.env.DEV ? DEV_DASHBOARD_DEFAULT : 'https://par-noir-dashboard.web.app');

export function dashboardStorageUrl(): string {
  const base = DASHBOARD_URL.replace(/\/$/, '');
  return `${base}/#storage`;
}
