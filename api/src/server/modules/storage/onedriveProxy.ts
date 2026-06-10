import { storageCredentialsService } from '../storageCredentialsService';

export class OnedriveProxyService {
  async getAccessToken(pnIdentifier: string, accountId?: string): Promise<string> {
    const normalized = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
    const record = await storageCredentialsService.getCredentials(normalized);
    if (!record?.credentials) {
      throw new Error('OneDrive not connected');
    }
    const accounts = record.credentials.onedriveAccounts as Array<Record<string, unknown>> | undefined;
    if (!accounts?.length) throw new Error('OneDrive not connected');

    const account = accountId
      ? accounts.find((a) => a.accountId === accountId)
      : accounts[0];
    if (!account) throw new Error(`OneDrive account not found: ${accountId}`);

    const token = (account.access_token ?? account.accessToken) as string | undefined;
    if (!token) throw new Error('OneDrive access token missing');

    const expiresAt = account.expires_at as number | undefined;
    if (expiresAt && Date.now() > expiresAt - 300_000) {
      const refresh = (account.refresh_token ?? account.refreshToken) as string | undefined;
      if (refresh && process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
        const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refresh,
            client_id: process.env.MICROSOFT_CLIENT_ID,
            client_secret: process.env.MICROSOFT_CLIENT_SECRET,
            scope: 'Files.ReadWrite offline_access'
          })
        });
        if (res.ok) {
          const data = (await res.json()) as {
            access_token: string;
            refresh_token?: string;
            expires_in?: number;
          };
          account.access_token = data.access_token;
          account.accessToken = data.access_token;
          if (data.refresh_token) {
            account.refresh_token = data.refresh_token;
            account.refreshToken = data.refresh_token;
          }
          if (data.expires_in) {
            account.expires_at = Date.now() + data.expires_in * 1000;
          }
          await storageCredentialsService.upsertCredentials(normalized, record.credentials);
          return data.access_token;
        }
      }
    }
    return token;
  }
}

export const onedriveProxyService = new OnedriveProxyService();
