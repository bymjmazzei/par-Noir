/**
 * Dropbox and OneDrive calls from the device.
 * Provider tokens go to that provider, never to the par Noir API.
 */

export type DeviceProviderInit = {
  accessToken: string;
  fetchImpl?: typeof fetch;
};

export async function deviceDropboxCall(
  path: string,
  body: unknown,
  init: DeviceProviderInit
): Promise<Response> {
  const fetchImpl = init.fetchImpl || fetch;
  return fetchImpl('https://api.dropboxapi.com/2/files/list_folder', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${init.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body ?? { path: path || '' }),
  });
}

export async function deviceOneDriveCall(
  path: string,
  init: DeviceProviderInit
): Promise<Response> {
  const fetchImpl = init.fetchImpl || fetch;
  const url = new URL('https://graph.microsoft.com/v1.0/me/drive/root');
  if (path) url.pathname = `/v1.0/me/drive/root:${path}:`;
  return fetchImpl(url.toString(), {
    headers: { Authorization: `Bearer ${init.accessToken}` },
  });
}
