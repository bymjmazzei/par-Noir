/**
 * Multi-cloud storage connect UI (Dropbox, S3, Azure, OneDrive, FTP).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Cloud, ExternalLink, Loader2 } from 'lucide-react';
import { ownerFetch, ownerGet } from '../../services/ownerApiService';
import { API_ENDPOINT } from '../../config/api';
import { SocialCloudMigrationWizard } from './SocialCloudMigrationWizard';

type ProviderId = 'google_drive' | 'dropbox' | 'aws_s3' | 'azure_blob' | 'onedrive' | 'ftp';

interface StorageAccount {
  provider: string;
  accountId: string;
  displayName?: string;
  isPrimary?: boolean;
  isSocialCloud?: boolean;
}

interface MultiCloudStoragePanelProps {
  pnIdentifier: string | null;
  authToken?: string;
  onConnected?: () => void;
  onConnectGoogleDrive?: () => void;
  googleDriveConnectedCount?: number;
  driveConnectDisabled?: boolean;
  connectedStorageCount?: number;
}

function buildAccountId(provider: string, pnIdentifier: string, slug: string): string {
  const pn = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
  const safeSlug = slug.replace(/::/g, '_').trim() || 'default';
  const prefix =
    provider === 'aws_s3' ? 's3' : provider === 'azure_blob' ? 'azure' : provider;
  return `${prefix}::${pn}::${safeSlug}`;
}

const DOC_LINKS: Record<Exclude<ProviderId, 'google_drive'>, string> = {
  dropbox: '/docs/developer/MULTI_CLOUD_STORAGE.md',
  aws_s3: '/docs/developer/STORAGE_AWS_S3_SETUP.md',
  azure_blob: '/docs/developer/STORAGE_AZURE_BLOB_SETUP.md',
  onedrive: '/docs/developer/STORAGE_ONEDRIVE_SETUP.md',
  ftp: '/docs/developer/STORAGE_FTP_SETUP.md'
};

export function MultiCloudStoragePanel({
  pnIdentifier,
  authToken,
  onConnected,
  onConnectGoogleDrive,
  googleDriveConnectedCount = 0,
  driveConnectDisabled = false,
  connectedStorageCount = 0
}: MultiCloudStoragePanelProps) {
  const [selected, setSelected] = useState<ProviderId>('google_drive');
  const [accounts, setAccounts] = useState<StorageAccount[]>([]);
  const [socialCloudProvider, setSocialCloudProvider] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [migrationTarget, setMigrationTarget] = useState<{
    provider: string;
    accountId: string;
  } | null>(null);

  const [s3Form, setS3Form] = useState({ bucket: '', region: 'us-east-1', accessKeyId: '', secretAccessKey: '' });
  const [azureForm, setAzureForm] = useState({ accountName: '', container: '', sasToken: '' });
  const [ftpForm, setFtpForm] = useState({
    host: '',
    port: 21,
    username: '',
    password: '',
    basePath: '/parnoir/',
    useTls: true,
    passiveMode: true
  });

  const refreshAccounts = useCallback(async () => {
    if (!pnIdentifier || !authToken) return;
    const res = await ownerGet(authToken, `/api/storage/accounts/${encodeURIComponent(pnIdentifier)}`);
    if (!res.ok) return;
    const data = (await res.json()) as {
      accounts?: StorageAccount[];
      socialCloudProvider?: string;
      primaryProvider?: string;
    };
    setAccounts(data.accounts ?? []);
    setSocialCloudProvider(data.socialCloudProvider ?? data.primaryProvider ?? null);
  }, [pnIdentifier, authToken]);

  useEffect(() => {
    void refreshAccounts();
  }, [refreshAccounts]);

  const disconnectAccount = async (provider: string, accountId: string) => {
    if (!pnIdentifier || !authToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await ownerFetch(
        authToken,
        'DELETE',
        `/api/storage/credentials/${encodeURIComponent(pnIdentifier)}/provider/${encodeURIComponent(provider)}/${encodeURIComponent(accountId)}`
      );
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to disconnect');
      }
      setMessage('Account disconnected.');
      await refreshAccounts();
      onConnected?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Disconnect failed');
    } finally {
      setLoading(false);
    }
  };

  const setSocialCloud = async (provider: string, accountId: string) => {
    if (!pnIdentifier || !authToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await ownerFetch(
        authToken,
        'PUT',
        `/api/storage/credentials/${encodeURIComponent(pnIdentifier)}/social-cloud`,
        { provider, accountId }
      );
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) {
        if (
          res.status === 409 &&
          (data.error === 'social_cloud_change_blocked' ||
            data.error === 'migration_required')
        ) {
          setMigrationTarget({ provider, accountId });
          setError(null);
          return;
        }
        throw new Error(data.message || data.error || 'Failed to set social cloud');
      }
      setMessage(`${provider} is now your social cloud (tables and indexes).`);
      await refreshAccounts();
      onConnected?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to set social cloud');
    } finally {
      setLoading(false);
    }
  };

  const testConnection = async () => {
    if (!pnIdentifier || !authToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await ownerFetch(
        authToken,
        'POST',
        `/api/storage/test-connection/${encodeURIComponent(pnIdentifier)}`
      );
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.message || 'Connection test failed');
      }
      setMessage('Connection test succeeded.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection test failed');
    } finally {
      setLoading(false);
    }
  };

  const connectOAuth = async (provider: 'dropbox' | 'onedrive') => {
    if (!pnIdentifier || !authToken) {
      setError('Unlock your identity before connecting storage.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const configRes = await fetch(`${API_ENDPOINT}/api/public-config`);
      const config = (await configRes.json()) as { dropboxAppKey?: string; microsoftClientId?: string };
      const redirectUri = `${window.location.origin}/oauth-callback.html?pn_popup=1`;
      let authUrl = '';
      if (provider === 'dropbox') {
        if (!config.dropboxAppKey) throw new Error('Dropbox is not configured on this server.');
        authUrl = `https://www.dropbox.com/oauth2/authorize?client_id=${encodeURIComponent(config.dropboxAppKey)}&redirect_uri=${encodeURIComponent(`${window.location.origin}/oauth-callback.html`)}&response_type=code&token_access_type=offline&state=pn_popup`;
      } else {
        if (!config.microsoftClientId) throw new Error('Microsoft OAuth is not configured on this server.');
        authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${encodeURIComponent(config.microsoftClientId)}&redirect_uri=${encodeURIComponent(`${window.location.origin}/oauth-callback.html`)}&response_type=code&scope=${encodeURIComponent('Files.ReadWrite offline_access')}&state=pn_popup`;
      }

      const popup = window.open(authUrl, 'pn-storage-oauth', 'width=500,height=700');
      if (!popup) throw new Error('Popup blocked — allow popups for OAuth.');

      const code = await new Promise<string>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          window.removeEventListener('message', onMessage);
          bc?.close();
          reject(new Error('OAuth timeout'));
        }, 300000);

        const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('par-noir-oauth-v1') : null;
        const finish = (payload: { code?: string; error?: string }) => {
          window.clearTimeout(timeout);
          window.removeEventListener('message', onMessage);
          bc?.close();
          if (payload.error) reject(new Error(payload.error));
          else if (payload.code) resolve(payload.code);
          else reject(new Error('No authorization code'));
        };

        const onMessage = (event: MessageEvent) => {
          if (event.origin !== window.location.origin) return;
          const payload = event.data as { type?: string; code?: string; error?: string };
          if (payload?.type !== 'oauth_callback' && payload?.type !== 'GOOGLE_OAUTH_CODE') return;
          finish(payload);
        };
        window.addEventListener('message', onMessage);

        if (bc) {
          bc.onmessage = (ev: MessageEvent) => {
            const payload = ev.data as { type?: string; code?: string; error?: string };
            if (payload?.type === 'oauth_callback') finish(payload);
          };
        }
      });

      const exchangePath =
        provider === 'dropbox' ? '/api/storage/oauth/dropbox/exchange' : '/api/storage/oauth/onedrive/exchange';
      const res = await ownerFetch(authToken, 'POST', exchangePath, {
        code,
        redirectUri: `${window.location.origin}/oauth-callback.html`,
        pnIdentifier
      });
      if (!res.ok) {
        const err = (await res.json()) as { message?: string };
        throw new Error(err.message || 'Token exchange failed');
      }
      setMessage(`${provider === 'dropbox' ? 'Dropbox' : 'OneDrive'} connected.`);
      await refreshAccounts();
      onConnected?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'OAuth failed');
    } finally {
      setLoading(false);
    }
  };

  const connectFormProvider = async () => {
    if (!pnIdentifier || !authToken) {
      setError('Unlock your identity before connecting storage.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let body: Record<string, unknown> = { provider: selected };
      if (selected === 'aws_s3') {
        const accountId = buildAccountId('aws_s3', pnIdentifier, s3Form.bucket);
        body = { provider: 'aws_s3', awsS3: { ...s3Form, accountId } };
      } else if (selected === 'azure_blob') {
        const accountId = buildAccountId('azure_blob', pnIdentifier, azureForm.container);
        body = { provider: 'azure_blob', azureBlob: { ...azureForm, accountId } };
      } else if (selected === 'ftp') {
        const slug = ftpForm.host.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 32);
        const accountId = buildAccountId('ftp', pnIdentifier, slug);
        body = { provider: 'ftp', ftp: { ...ftpForm, accountId } };
      } else {
        throw new Error('Use OAuth for this provider');
      }
      const res = await ownerFetch(
        authToken,
        'PUT',
        `/api/storage/credentials/${encodeURIComponent(pnIdentifier)}/provider`,
        body
      );
      if (!res.ok) {
        const err = (await res.json()) as { message?: string };
        throw new Error(err.message || 'Failed to save credentials');
      }
      setMessage('Storage provider connected.');
      await refreshAccounts();
      onConnected?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connect failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-neutral-900/60 border border-neutral-700 rounded-xl p-4 sm:p-6 mt-4">
      <div className="flex items-start gap-3 mb-4">
        <Cloud className="h-5 w-5 text-violet-400 shrink-0 mt-0.5" />
        <div>
          <h3 className="text-lg font-semibold text-white">Secure Cloud</h3>
          <p className="text-text-secondary text-sm">
            Connect encrypted cloud storage. Choose Google Drive, Dropbox, S3, Azure, OneDrive, or FTP — one provider becomes your social cloud (tables and indexes); files can live on any connected account.
          </p>
          {connectedStorageCount > 0 && (
            <p className="text-green-400 text-sm mt-2">
              {connectedStorageCount} storage provider{connectedStorageCount !== 1 ? 's' : ''} connected
              {googleDriveConnectedCount > 0 ? ` (${googleDriveConnectedCount} Google Drive)` : ''}
            </p>
          )}
          {socialCloudProvider && (
            <p className="text-green-400 text-sm mt-2">Social cloud: {socialCloudProvider.replace('_', ' ')}</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {(['google_drive', 'dropbox', 'aws_s3', 'azure_blob', 'onedrive', 'ftp'] as ProviderId[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setSelected(p)}
            className={`px-3 py-1.5 rounded-lg text-sm border ${
              selected === p
                ? 'border-violet-500 bg-violet-600/20 text-white'
                : 'border-neutral-600 text-text-secondary hover:border-neutral-500'
            }`}
          >
            {p === 'google_drive' ? 'Google Drive' : p.replace('_', ' ')}
          </button>
        ))}
      </div>

      {selected === 'google_drive' && onConnectGoogleDrive && (
        <div className="mb-4">
          <button
            type="button"
            disabled={driveConnectDisabled || !pnIdentifier}
            onClick={onConnectGoogleDrive}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm disabled:opacity-50"
          >
            {googleDriveConnectedCount > 0
              ? `Google Drive connected (${googleDriveConnectedCount}) — add or re-authenticate`
              : 'Connect Google Drive'}
          </button>
        </div>
      )}

      {selected !== 'google_drive' && (
        <>
      <a
        href={DOC_LINKS[selected]}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mb-4"
      >
        Setup instructions <ExternalLink className="h-3 w-3" />
      </a>

      {(selected === 'dropbox' || selected === 'onedrive') && (
        <button
          type="button"
          disabled={loading || !pnIdentifier}
          onClick={() => connectOAuth(selected)}
          className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin inline" /> : `Connect ${selected === 'dropbox' ? 'Dropbox' : 'OneDrive'}`}
        </button>
      )}

      {selected === 'aws_s3' && (
        <div className="grid gap-2 sm:grid-cols-2">
          <input className="input-dark" placeholder="Bucket" value={s3Form.bucket} onChange={(e) => setS3Form({ ...s3Form, bucket: e.target.value })} />
          <input className="input-dark" placeholder="Region" value={s3Form.region} onChange={(e) => setS3Form({ ...s3Form, region: e.target.value })} />
          <input className="input-dark" placeholder="Access key ID" value={s3Form.accessKeyId} onChange={(e) => setS3Form({ ...s3Form, accessKeyId: e.target.value })} />
          <input className="input-dark" type="password" placeholder="Secret access key" value={s3Form.secretAccessKey} onChange={(e) => setS3Form({ ...s3Form, secretAccessKey: e.target.value })} />
          <button type="button" disabled={loading} onClick={connectFormProvider} className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm sm:col-span-2">Connect S3</button>
        </div>
      )}

      {selected === 'azure_blob' && (
        <div className="grid gap-2">
          <input className="input-dark" placeholder="Storage account name" value={azureForm.accountName} onChange={(e) => setAzureForm({ ...azureForm, accountName: e.target.value })} />
          <input className="input-dark" placeholder="Container" value={azureForm.container} onChange={(e) => setAzureForm({ ...azureForm, container: e.target.value })} />
          <input className="input-dark" type="password" placeholder="SAS token" value={azureForm.sasToken} onChange={(e) => setAzureForm({ ...azureForm, sasToken: e.target.value })} />
          <button type="button" disabled={loading} onClick={connectFormProvider} className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm">Connect Azure Blob</button>
        </div>
      )}

      {selected === 'ftp' && (
        <div className="grid gap-2 sm:grid-cols-2">
          <input className="input-dark" placeholder="Host" value={ftpForm.host} onChange={(e) => setFtpForm({ ...ftpForm, host: e.target.value })} />
          <input className="input-dark" type="number" placeholder="Port" value={ftpForm.port} onChange={(e) => setFtpForm({ ...ftpForm, port: Number(e.target.value) })} />
          <input className="input-dark" placeholder="Username" value={ftpForm.username} onChange={(e) => setFtpForm({ ...ftpForm, username: e.target.value })} />
          <input className="input-dark" type="password" placeholder="Password" value={ftpForm.password} onChange={(e) => setFtpForm({ ...ftpForm, password: e.target.value })} />
          <input className="input-dark sm:col-span-2" placeholder="Base path" value={ftpForm.basePath} onChange={(e) => setFtpForm({ ...ftpForm, basePath: e.target.value })} />
          <label className="text-sm text-text-secondary flex items-center gap-2">
            <input type="checkbox" checked={ftpForm.useTls} onChange={(e) => setFtpForm({ ...ftpForm, useTls: e.target.checked })} /> Use FTPS
          </label>
          <label className="text-sm text-text-secondary flex items-center gap-2">
            <input type="checkbox" checked={ftpForm.passiveMode} onChange={(e) => setFtpForm({ ...ftpForm, passiveMode: e.target.checked })} /> Passive mode
          </label>
          <button type="button" disabled={loading} onClick={connectFormProvider} className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm sm:col-span-2">Connect FTP</button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mt-4">
        <button
          type="button"
          disabled={loading || !pnIdentifier || !authToken}
          onClick={testConnection}
          className="px-3 py-1.5 rounded-lg border border-neutral-600 text-sm text-text-secondary hover:text-white"
        >
          Test connection
        </button>
      </div>
        </>
      )}

      {accounts.length > 0 && (
        <ul className="mt-4 text-sm text-text-secondary space-y-2">
          {accounts.map((a) => (
            <li key={`${a.provider}-${a.accountId}`} className="flex flex-wrap items-center gap-2">
              <span>
                {a.displayName ?? a.provider}
                {a.isSocialCloud || a.isPrimary ? (
                  <span className="text-violet-400 ml-1">(social cloud)</span>
                ) : null}
              </span>
              {!(a.isSocialCloud || a.isPrimary) && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setSocialCloud(a.provider, a.accountId)}
                  className="text-xs text-blue-400 hover:text-blue-300 underline"
                >
                  Set as social cloud
                </button>
              )}
              {a.provider !== 'google_drive' && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => disconnectAccount(a.provider, a.accountId)}
                  className="text-xs text-red-400 hover:text-red-300 underline"
                >
                  Disconnect
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {migrationTarget && pnIdentifier && authToken && (
        <SocialCloudMigrationWizard
          pnIdentifier={pnIdentifier}
          authToken={authToken}
          accounts={accounts}
          targetProvider={migrationTarget.provider}
          targetAccountId={migrationTarget.accountId}
          onClose={() => setMigrationTarget(null)}
          onComplete={() => {
            setMigrationTarget(null);
            setMessage('Social cloud migrated and updated.');
            void refreshAccounts();
            onConnected?.();
          }}
        />
      )}

      {message && <p className="mt-3 text-green-400 text-sm">{message}</p>}
      {error && <p className="mt-3 text-red-400 text-sm">{error}</p>}

      <style>{`
        .input-dark {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border-radius: 0.5rem;
          border: 1px solid rgb(64 64 64);
          background: rgb(23 23 23);
          color: white;
          font-size: 0.875rem;
        }
      `}</style>
    </div>
  );
}
