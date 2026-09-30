import type { CSSProperties, ReactNode } from 'react';

export interface CloudReconnectPromptProps {
  open: boolean;
  socialCloudProvider?: string | null;
  onReconnect: () => void;
  onDismiss: () => void;
  /** Pair this unkeyed browser when the pN already has keyed devices elsewhere */
  onPairDevice?: () => void;
  showPairDevice?: boolean;
  /** @deprecated use onPairDevice */
  onKeyDevice?: () => void;
  /** @deprecated use showPairDevice */
  showKeyDevice?: boolean;
  title?: string;
  /** Replaces the default reconnect copy. */
  message?: string;
  /** False when this app cannot start Google sign-in. */
  allowReconnect?: boolean;
  /** True while OAuth popup / exchange is in progress from Reconnect */
  busy?: boolean;
  children?: ReactNode;
  className?: string;
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.55)',
  zIndex: 10050,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16
};

const cardStyle: CSSProperties = {
  width: '100%',
  maxWidth: 420,
  background: '#171717',
  color: '#f5f5f5',
  border: '1px solid #404040',
  borderRadius: 12,
  padding: 20,
  boxSizing: 'border-box'
};

const btnRow: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  marginTop: 16
};

const primaryBtn: CSSProperties = {
  appearance: 'none',
  border: 'none',
  borderRadius: 8,
  padding: '10px 14px',
  background: '#7c3aed',
  color: '#fff',
  fontWeight: 600,
  cursor: 'pointer'
};

const secondaryBtn: CSSProperties = {
  ...primaryBtn,
  background: 'transparent',
  border: '1px solid #525252',
  color: '#e5e5e5',
  fontWeight: 500
};

export const DASHBOARD_CLOUD_CONNECT_TITLE = 'Connect Google in the dashboard';

export const DASHBOARD_CLOUD_CONNECT_MESSAGE =
  'Google is connected in the dashboard. Open the dashboard, connect Google once, then unlock this app again.';

function providerLabel(provider?: string | null): string {
  if (!provider) return 'cloud storage';
  return provider.replace(/_/g, ' ');
}

/**
 * Post-unlock modal: cloud is linked on the pN but inactive on this device.
 */
export function CloudReconnectPrompt({
  open,
  socialCloudProvider,
  onReconnect,
  onDismiss,
  onPairDevice,
  showPairDevice,
  onKeyDevice,
  showKeyDevice = false,
  title = 'Reconnect cloud storage',
  message,
  allowReconnect = true,
  busy = false,
  children,
  className = ''
}: CloudReconnectPromptProps) {
  if (!open) return null;

  const showPair = showPairDevice ?? showKeyDevice;
  const onPair = onPairDevice ?? onKeyDevice;

  return (
    <div className={className} style={overlayStyle} role="dialog" aria-modal="true" aria-labelledby="pn-cloud-reconnect-title">
      <div style={cardStyle}>
        <h2 id="pn-cloud-reconnect-title" style={{ margin: '0 0 8px', fontSize: 18 }}>
          {title}
        </h2>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45, color: '#d4d4d4' }}>
          {message ??
            `${providerLabel(socialCloudProvider)} is linked to this pN but not signed in on this device. Reconnect here to use messaging, uploads, and your private cloud on this unlock.`}
        </p>
        {showPair ? (
          <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.45, color: '#a3a3a3' }}>
            This pN already has a keyed device. Pair this browser for full access, or reconnect cloud
            for this unlock only.
          </p>
        ) : null}
        {children}
        <div style={btnRow}>
          {allowReconnect ? (
            <button
              type="button"
              style={{ ...primaryBtn, opacity: busy ? 0.7 : 1, cursor: busy ? 'wait' : 'pointer' }}
              onClick={onReconnect}
              disabled={busy}
            >
              {busy ? 'Opening sign-in…' : 'Reconnect'}
            </button>
          ) : null}
          {showPair && onPair ? (
            <button type="button" style={secondaryBtn} onClick={onPair} disabled={busy}>
              Pair this device for full access
            </button>
          ) : null}
          <button type="button" style={secondaryBtn} onClick={onDismiss} disabled={busy}>
            Not now
          </button>
        </div>
        {showPair ? (
          <p style={{ margin: '12px 0 0', fontSize: 12, color: '#a3a3a3', lineHeight: 1.4 }}>
            Without pairing, cloud tokens for this device are cleared when you lock. Generate the QR
            on a keyed device under Recovery → Add device.
          </p>
        ) : null}
      </div>
    </div>
  );
}
