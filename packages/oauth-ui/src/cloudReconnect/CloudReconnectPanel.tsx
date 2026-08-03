import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import {
  buildAccountId,
  type StorageCredentialsEnvelope
} from '@par-noir/user-owned-storage';
import {
  isCloudProviderId,
  isOAuthCloudProvider,
  ownerFetch,
  reconnectOAuthProvider
} from './reconnectFlows';
import type { CloudProviderId, PortableConnectForms } from './types';

export interface CloudReconnectPanelProps {
  open: boolean;
  onClose: () => void;
  pnIdentifier: string;
  authToken: string;
  apiEndpoint: string;
  /** Google OAuth client id (VITE_GOOGLE_DRIVE_CLIENT_ID or API public config) */
  googleClientId?: string | null;
  preferredProvider?: string | null;
  onConnected: (envelope: StorageCredentialsEnvelope) => void | Promise<void>;
  className?: string;
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.55)',
  zIndex: 10060,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16
};

const cardStyle: CSSProperties = {
  width: '100%',
  maxWidth: 480,
  maxHeight: '90vh',
  overflow: 'auto',
  background: '#171717',
  color: '#f5f5f5',
  border: '1px solid #404040',
  borderRadius: 12,
  padding: 20,
  boxSizing: 'border-box'
};

const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  marginTop: 4,
  marginBottom: 10,
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid #525252',
  background: '#0a0a0a',
  color: '#f5f5f5'
};

const btnStyle: CSSProperties = {
  appearance: 'none',
  border: '1px solid #525252',
  borderRadius: 8,
  padding: '8px 12px',
  background: '#262626',
  color: '#f5f5f5',
  cursor: 'pointer',
  marginRight: 8,
  marginBottom: 8
};

const primaryBtn: CSSProperties = {
  ...btnStyle,
  background: '#7c3aed',
  borderColor: '#7c3aed',
  fontWeight: 600
};

const PROVIDERS: { id: CloudProviderId; label: string }[] = [
  { id: 'google_drive', label: 'Google Drive' },
  { id: 'dropbox', label: 'Dropbox' },
  { id: 'onedrive', label: 'OneDrive' },
  { id: 'aws_s3', label: 'AWS S3' },
  { id: 'azure_blob', label: 'Azure Blob' },
  { id: 'ftp', label: 'FTP' }
];

const emptyForms = (): PortableConnectForms => ({
  aws_s3: {
    bucket: '',
    region: 'us-east-1',
    accessKeyId: '',
    secretAccessKey: '',
    prefix: ''
  },
  azure_blob: {
    accountName: '',
    container: '',
    sasToken: '',
    prefix: ''
  },
  ftp: {
    host: '',
    port: '21',
    username: '',
    password: '',
    basePath: '/',
    useTls: true,
    passiveMode: true
  }
});

/** Dispatched after cloud secrets are sealed on-device so Storage UIs can rehydrate. */
export const PN_CLOUD_CREDENTIALS_READY_EVENT = 'pn-cloud-credentials-ready';

/**
 * In-app cloud reconnect: OAuth providers + portable secret forms.
 * When preferredProvider is set, skips the provider picker (linked provider only).
 * Returns a full local envelope (with secrets) via onConnected; caller seals/persists.
 */
export function CloudReconnectPanel({
  open,
  onClose,
  pnIdentifier,
  authToken,
  apiEndpoint,
  googleClientId,
  preferredProvider,
  onConnected,
  className = ''
}: CloudReconnectPanelProps) {
  const preferredId = isCloudProviderId(preferredProvider) ? preferredProvider : null;
  const [selected, setSelected] = useState<CloudProviderId>(preferredId ?? 'google_drive');
  const [allowSwitchProvider, setAllowSwitchProvider] = useState(!preferredId);
  const [forms, setForms] = useState<PortableConnectForms>(emptyForms);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setMessage(null);
    if (preferredId) {
      setSelected(preferredId);
      setAllowSwitchProvider(false);
    } else {
      setAllowSwitchProvider(true);
    }
  }, [open, preferredId]);

  if (!open) return null;

  const showPicker = allowSwitchProvider || !preferredId;
  const providerLabel = PROVIDERS.find((p) => p.id === selected)?.label ?? selected;

  const connectPortable = async () => {
    const defaultPrefix = `par-noir-${pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`}`;
    if (selected === 'aws_s3') {
      const f = forms.aws_s3;
      if (!f.bucket || !f.accessKeyId || !f.secretAccessKey) {
        throw new Error('Bucket, access key id, and secret access key are required.');
      }
      const accountId = buildAccountId('aws_s3', pnIdentifier, f.bucket);
      const awsS3 = {
        ...f,
        prefix: f.prefix.trim() || defaultPrefix,
        accountId
      };
      const res = await ownerFetch(
        apiEndpoint,
        authToken,
        'PUT',
        `/api/storage/credentials/${encodeURIComponent(pnIdentifier)}/provider`,
        { provider: 'aws_s3', awsS3 }
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(err.message || 'Failed to save S3 credentials');
      }
      await onConnected({
        socialCloudProvider: 'aws_s3',
        socialCloudAccountId: accountId,
        awsS3Accounts: [awsS3]
      });
      return;
    }
    if (selected === 'azure_blob') {
      const f = forms.azure_blob;
      if (!f.accountName || !f.container || !f.sasToken.trim()) {
        throw new Error('Account name, container, and SAS token are required.');
      }
      const accountId = buildAccountId('azure_blob', pnIdentifier, f.container);
      const azureBlob = {
        ...f,
        prefix: f.prefix.trim() || defaultPrefix,
        accountId
      };
      const res = await ownerFetch(
        apiEndpoint,
        authToken,
        'PUT',
        `/api/storage/credentials/${encodeURIComponent(pnIdentifier)}/provider`,
        { provider: 'azure_blob', azureBlob }
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(err.message || 'Failed to save Azure credentials');
      }
      await onConnected({
        socialCloudProvider: 'azure_blob',
        socialCloudAccountId: accountId,
        azureBlobAccounts: [azureBlob]
      });
      return;
    }
    if (selected === 'ftp') {
      const f = forms.ftp;
      if (!f.host || !f.username || !f.password) {
        throw new Error('Host, username, and password are required.');
      }
      const slug = f.host.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 32);
      const accountId = buildAccountId('ftp', pnIdentifier, slug);
      const ftp = {
        accountId,
        host: f.host,
        port: Number(f.port) || 21,
        username: f.username,
        password: f.password,
        basePath: f.basePath || '/',
        useTls: f.useTls,
        passiveMode: f.passiveMode
      };
      const res = await ownerFetch(
        apiEndpoint,
        authToken,
        'PUT',
        `/api/storage/credentials/${encodeURIComponent(pnIdentifier)}/provider`,
        { provider: 'ftp', ftp }
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(err.message || 'Failed to save FTP credentials');
      }
      await onConnected({
        socialCloudProvider: 'ftp',
        socialCloudAccountId: accountId,
        ftpAccounts: [ftp]
      });
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      if (isOAuthCloudProvider(selected)) {
        const envelope = await reconnectOAuthProvider({
          provider: selected,
          pnIdentifier,
          authToken,
          apiEndpoint,
          googleClientId
        });
        await onConnected(envelope);
      } else {
        await connectPortable();
      }
      setMessage('Cloud connected on this device.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reconnect failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={className} style={overlayStyle} role="dialog" aria-modal="true">
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Reconnect {providerLabel}</h2>
          <button type="button" style={btnStyle} onClick={onClose} disabled={loading}>
            Close
          </button>
        </div>
        <p style={{ fontSize: 13, color: '#a3a3a3', marginTop: 8 }}>
          Sign in to the provider linked to this pN. Secrets stay on this device.
        </p>
        {showPicker ? (
          <div style={{ marginTop: 12, marginBottom: 12 }}>
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                type="button"
                style={{
                  ...btnStyle,
                  background: selected === p.id ? '#7c3aed' : '#262626',
                  borderColor: selected === p.id ? '#7c3aed' : '#525252'
                }}
                onClick={() => setSelected(p.id)}
                disabled={loading}
              >
                {p.label}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ marginTop: 12, marginBottom: 12 }}>
            <button
              type="button"
              style={{ ...btnStyle, fontSize: 12, marginBottom: 0 }}
              onClick={() => setAllowSwitchProvider(true)}
              disabled={loading}
            >
              Use a different provider
            </button>
          </div>
        )}
        <form onSubmit={onSubmit}>
          {selected === 'aws_s3' && (
            <>
              <label style={{ fontSize: 12 }}>
                Bucket
                <input
                  style={inputStyle}
                  value={forms.aws_s3.bucket}
                  onChange={(e) =>
                    setForms((f) => ({ ...f, aws_s3: { ...f.aws_s3, bucket: e.target.value } }))
                  }
                />
              </label>
              <label style={{ fontSize: 12 }}>
                Region
                <input
                  style={inputStyle}
                  value={forms.aws_s3.region}
                  onChange={(e) =>
                    setForms((f) => ({ ...f, aws_s3: { ...f.aws_s3, region: e.target.value } }))
                  }
                />
              </label>
              <label style={{ fontSize: 12 }}>
                Access key ID
                <input
                  style={inputStyle}
                  value={forms.aws_s3.accessKeyId}
                  onChange={(e) =>
                    setForms((f) => ({ ...f, aws_s3: { ...f.aws_s3, accessKeyId: e.target.value } }))
                  }
                />
              </label>
              <label style={{ fontSize: 12 }}>
                Secret access key
                <input
                  style={inputStyle}
                  type="password"
                  value={forms.aws_s3.secretAccessKey}
                  onChange={(e) =>
                    setForms((f) => ({
                      ...f,
                      aws_s3: { ...f.aws_s3, secretAccessKey: e.target.value }
                    }))
                  }
                />
              </label>
              <label style={{ fontSize: 12 }}>
                Prefix (optional)
                <input
                  style={inputStyle}
                  value={forms.aws_s3.prefix}
                  onChange={(e) =>
                    setForms((f) => ({ ...f, aws_s3: { ...f.aws_s3, prefix: e.target.value } }))
                  }
                />
              </label>
            </>
          )}
          {selected === 'azure_blob' && (
            <>
              <label style={{ fontSize: 12 }}>
                Account name
                <input
                  style={inputStyle}
                  value={forms.azure_blob.accountName}
                  onChange={(e) =>
                    setForms((f) => ({
                      ...f,
                      azure_blob: { ...f.azure_blob, accountName: e.target.value }
                    }))
                  }
                />
              </label>
              <label style={{ fontSize: 12 }}>
                Container
                <input
                  style={inputStyle}
                  value={forms.azure_blob.container}
                  onChange={(e) =>
                    setForms((f) => ({
                      ...f,
                      azure_blob: { ...f.azure_blob, container: e.target.value }
                    }))
                  }
                />
              </label>
              <label style={{ fontSize: 12 }}>
                SAS token
                <input
                  style={inputStyle}
                  type="password"
                  value={forms.azure_blob.sasToken}
                  onChange={(e) =>
                    setForms((f) => ({
                      ...f,
                      azure_blob: { ...f.azure_blob, sasToken: e.target.value }
                    }))
                  }
                />
              </label>
            </>
          )}
          {selected === 'ftp' && (
            <>
              <label style={{ fontSize: 12 }}>
                Host
                <input
                  style={inputStyle}
                  value={forms.ftp.host}
                  onChange={(e) =>
                    setForms((f) => ({ ...f, ftp: { ...f.ftp, host: e.target.value } }))
                  }
                />
              </label>
              <label style={{ fontSize: 12 }}>
                Username
                <input
                  style={inputStyle}
                  value={forms.ftp.username}
                  onChange={(e) =>
                    setForms((f) => ({ ...f, ftp: { ...f.ftp, username: e.target.value } }))
                  }
                />
              </label>
              <label style={{ fontSize: 12 }}>
                Password
                <input
                  style={inputStyle}
                  type="password"
                  value={forms.ftp.password}
                  onChange={(e) =>
                    setForms((f) => ({ ...f, ftp: { ...f.ftp, password: e.target.value } }))
                  }
                />
              </label>
            </>
          )}
          {isOAuthCloudProvider(selected) && (
            <p style={{ fontSize: 13, color: '#d4d4d4' }}>
              Continues in a popup to authorize {providerLabel}.
            </p>
          )}
          {error && (
            <p style={{ color: '#f87171', fontSize: 13 }} role="alert">
              {error}
            </p>
          )}
          {message && <p style={{ color: '#4ade80', fontSize: 13 }}>{message}</p>}
          <button type="submit" style={primaryBtn} disabled={loading}>
            {loading
              ? 'Working…'
              : isOAuthCloudProvider(selected)
                ? `Authorize ${providerLabel}`
                : 'Save & connect'}
          </button>
        </form>
      </div>
    </div>
  );
}
