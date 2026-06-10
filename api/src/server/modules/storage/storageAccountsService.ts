import type { StorageCredentialsEnvelope, StorageProviderId } from '@par-noir/user-owned-storage';
import { resolveSocialCloudProvider } from '@par-noir/user-owned-storage';

export interface StorageAccountSummary {
  provider: StorageProviderId;
  accountId: string;
  email?: string;
  displayName?: string;
  /** @deprecated use isSocialCloud */
  isPrimary?: boolean;
  isSocialCloud?: boolean;
}

function accountLabel(provider: string, index: number): string {
  const names: Record<string, string> = {
    google_drive: 'Google Drive',
    dropbox: 'Dropbox',
    aws_s3: 'AWS S3',
    azure_blob: 'Azure Blob',
    onedrive: 'OneDrive',
    ftp: 'FTP'
  };
  return `${names[provider] ?? provider} ${index + 1}`;
}

export async function listStorageAccounts(
  pnIdentifier: string,
  credentials: StorageCredentialsEnvelope
): Promise<StorageAccountSummary[]> {
  const socialCloud = resolveSocialCloudProvider(credentials);
  const socialAccountId = credentials.socialCloudAccountId;
  const accounts: StorageAccountSummary[] = [];

  const googleDriveAccounts =
    credentials.googleDriveAccounts ??
    ((credentials as { googleDrive?: unknown }).googleDrive
      ? [(credentials as { googleDrive: Record<string, unknown> }).googleDrive]
      : []);

  for (let i = 0; i < googleDriveAccounts.length; i++) {
    const account = googleDriveAccounts[i] as Record<string, unknown>;
    const accountId = String(
      account.accountId ?? account.backendId ?? account.keyPrefix ?? `${pnIdentifier}_${i}`
    );
    let email = account.email as string | undefined;
    let displayName = (account.email as string) || (account.keyPrefix as string);

    const accessToken = (account.access_token ?? account.accessToken) as string | undefined;
    if (accessToken) {
      try {
        const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (userInfoResponse.ok) {
          const userInfo = (await userInfoResponse.json()) as { email?: string; name?: string };
          email = userInfo.email;
          displayName = userInfo.name || userInfo.email || accountLabel('google_drive', i);
        }
      } catch {
        // fall through to stored fields
      }
    }

    const isSocial =
      socialCloud === 'google_drive' &&
      (!socialAccountId || socialAccountId === accountId);

    accounts.push({
      provider: 'google_drive',
      accountId,
      email,
      displayName: displayName || accountLabel('google_drive', i),
      isPrimary: isSocial,
      isSocialCloud: isSocial
    });
  }

  const pushSimple = <T extends object>(
    provider: StorageProviderId,
    items: T[] | undefined,
    idKey: keyof T & string = 'accountId' as keyof T & string,
    labelFn?: (a: T, i: number) => string
  ) => {
    if (!items?.length) return;
    items.forEach((account, i) => {
      const rec = account as Record<string, unknown>;
      const accountId = String(rec[idKey] ?? `${provider}_${i}`);
      const isSocial =
        socialCloud === provider && (!socialAccountId || socialAccountId === accountId);
      accounts.push({
        provider,
        accountId,
        email: rec.email as string | undefined,
        displayName: labelFn?.(account, i) ?? accountLabel(provider, i),
        isPrimary: isSocial,
        isSocialCloud: isSocial
      });
    });
  };

  pushSimple('dropbox', credentials.dropboxAccounts);
  pushSimple('aws_s3', credentials.awsS3Accounts, 'accountId', (a) =>
    `S3: ${a.bucket}/${a.prefix ?? ''}`
  );
  pushSimple('azure_blob', credentials.azureBlobAccounts, 'accountId', (a) =>
    `Azure: ${a.accountName}/${a.container}`
  );
  pushSimple('onedrive', credentials.onedriveAccounts);
  pushSimple('ftp', credentials.ftpAccounts, 'accountId', (a) => `FTP: ${a.host}`);

  return accounts;
}
