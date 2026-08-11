import { storageCredentialsService } from '../storageCredentialsService';
import { hashIdentifier, safeLogger } from '../../../utils/logger';
import { isDeviceCloudCustodyEnabled } from '../socialMailboxService';

export class DropboxProxyService {
  /**
   * Resolve a Dropbox access token.
   * Under device cloud custody: forwardedAccessToken only (no DB read/refresh/dual-write).
   * Opt-out: may read/refresh from stored credentials.
   */
  async getAccessToken(
    pnIdentifier: string,
    accountId?: string,
    forwardedAccessToken?: string
  ): Promise<string> {
    const normalized = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
    const forwarded = forwardedAccessToken?.trim() || '';

    if (isDeviceCloudCustodyEnabled()) {
      if (!forwarded) {
        safeLogger.warn('[DropboxProxy] Cloud access token required under custody', {
          reason: 'cloud_token_required',
          pnIdHash: hashIdentifier(normalized),
        });
        throw new Error(
          'Dropbox access token required. Forward X-PN-Cloud-Access-Token after unlocking with cloud credentials.'
        );
      }
      return forwarded;
    }

    if (forwarded) return forwarded;

    const record = await storageCredentialsService.getCredentials(normalized);
    if (!record?.credentials) {
      throw new Error('Dropbox not connected');
    }
    const accounts = record.credentials.dropboxAccounts as Array<Record<string, unknown>> | undefined;
    if (!accounts?.length) throw new Error('Dropbox not connected');

    const account = accountId
      ? accounts.find((a) => a.accountId === accountId)
      : accounts[0];
    if (!account) throw new Error(`Dropbox account not found: ${accountId}`);

    const token = (account.access_token ?? account.accessToken) as string | undefined;
    if (!token) throw new Error('Dropbox access token missing');

    const expiresAt = account.expires_at as number | undefined;
    if (expiresAt && Date.now() > expiresAt - 300_000) {
      const refresh = (account.refresh_token ?? account.refreshToken) as string | undefined;
      if (refresh && process.env.DROPBOX_APP_KEY && process.env.DROPBOX_APP_SECRET) {
        const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refresh,
            client_id: process.env.DROPBOX_APP_KEY,
            client_secret: process.env.DROPBOX_APP_SECRET,
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as { access_token: string; expires_in?: number };
          account.access_token = data.access_token;
          account.accessToken = data.access_token;
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

export const dropboxProxyService = new DropboxProxyService();
