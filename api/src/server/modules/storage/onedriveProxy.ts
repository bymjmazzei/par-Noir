import { hashIdentifier, safeLogger } from '../../../utils/logger';

export class OnedriveProxyService {
  /**
   * Resolve a OneDrive access token from the device-forwarded header only.
   */
  async getAccessToken(
    pnIdentifier: string,
    _accountId?: string,
    forwardedAccessToken?: string
  ): Promise<string> {
    const normalized = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
    const forwarded = forwardedAccessToken?.trim() || '';
    if (!forwarded) {
      safeLogger.warn('[OneDriveProxy] Cloud access token required', {
        reason: 'cloud_token_required',
        pnIdHash: hashIdentifier(normalized),
      });
      throw new Error(
        'OneDrive access token required. Forward X-PN-Cloud-Access-Token after unlocking with cloud credentials.'
      );
    }
    return forwarded;
  }
}

export const onedriveProxyService = new OnedriveProxyService();
