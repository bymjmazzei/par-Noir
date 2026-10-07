import { createConnectionsClient, type Connection } from '@par-noir/social-connections';
import { listDeviceConnections } from '@par-noir/device-cloud-credentials';
import { hasCloudCredentialsReady } from '@par-noir/oauth-ui';
import { penSessionDrive } from './penDriveLibrary';

const client = createConnectionsClient({
  waitForCloud: async (pn) => hasCloudCredentialsReady(pn),
  listConnectionRows: async (userPnIdentifier) => {
    const drive = await penSessionDrive(userPnIdentifier);
    const sheetId = drive.index.sheetIds.connections;
    if (!sheetId) return [];
    return (await listDeviceConnections(drive.accessToken, sheetId)) as Connection[];
  }
});

export async function getPenConnections(userPnIdentifier: string): Promise<Connection[]> {
  return client.getConnections(userPnIdentifier);
}
