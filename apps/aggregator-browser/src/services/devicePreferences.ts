import { readDevicePreferences, tablesPreferences, writeDevicePreferences } from '@par-noir/device-cloud-credentials';
import { sessionDriveFor } from './sessionDrive';
import { sessionTablesFor } from './sessionSocial';

export async function loadDevicePreferenceDoc(
  pnIdentifier: string
): Promise<Record<string, unknown> | null> {
  const tables = await sessionTablesFor(pnIdentifier);
  if (tables) return tablesPreferences(tables).read();
  const drive = await sessionDriveFor(pnIdentifier);
  const sheetId = drive.index.sheetIds.preferences;
  if (!sheetId) return null;
  return readDevicePreferences(drive.accessToken, sheetId);
}

export async function putDevicePreferences(
  pnIdentifier: string,
  patch: Record<string, unknown>
): Promise<{ ok: boolean; status: number }> {
  try {
    const tables = await sessionTablesFor(pnIdentifier);
    if (tables) {
      await tablesPreferences(tables).merge(patch);
      return { ok: true, status: 200 };
    }
    const drive = await sessionDriveFor(pnIdentifier);
    const sheetId = drive.index.sheetIds.preferences;
    if (!sheetId) return { ok: false, status: 404 };
    const current = (await readDevicePreferences(drive.accessToken, sheetId)) || {};
    await writeDevicePreferences(drive.accessToken, sheetId, { ...current, ...patch });
    return { ok: true, status: 200 };
  } catch {
    return { ok: false, status: 409 };
  }
}
