/**
 * Append one ciphertext row to the user's Google Sheet from the device.
 * The access token is sent to Google, never to the par Noir API.
 */

export type DeviceCloudRowResult = {
  spreadsheetId: string;
  provider: 'google';
};

export async function appendDeviceCloudRow(
  accessToken: string,
  row: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch
): Promise<DeviceCloudRowResult> {
  const spreadsheetId = typeof row.spreadsheetId === 'string' ? row.spreadsheetId.trim() : '';
  if (!spreadsheetId) {
    throw new Error('layout spreadsheet id is required');
  }

  const appended = await fetchImpl(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/A1:append?valueInputOption=RAW`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [[JSON.stringify(row)]] }),
    }
  );
  if (!appended.ok) {
    throw new Error(`Google sheet append failed (${appended.status})`);
  }
  return { spreadsheetId, provider: 'google' };
}
