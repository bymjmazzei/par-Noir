/** True when a Google Sheets / gaxios call hit per-user read/write quota (429). */
export function isGoogleSheetsRateLimit(error: unknown): boolean {
  const err = error as { code?: number; response?: { status?: number } };
  return err?.code === 429 || err?.response?.status === 429;
}
