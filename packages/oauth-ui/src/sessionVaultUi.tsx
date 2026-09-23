/**
 * Shared Cap session-vault enroll / unlock chrome.
 */

import type { CSSProperties, ReactNode } from 'react';

export interface SessionVaultEnrollPromptProps {
  open: boolean;
  title?: string;
  body?: string;
  confirmLabel?: string;
  declineLabel?: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void | Promise<void>;
  onDecline: () => void;
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 200,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0,0,0,0.55)',
  padding: 16,
};

const cardStyle: CSSProperties = {
  width: '100%',
  maxWidth: 400,
  borderRadius: 12,
  background: '#1a1a1a',
  color: '#f5f5f5',
  padding: 24,
  border: '1px solid #333',
};

/**
 * One-time opt-in after unlock: stay unlocked on this device behind biometrics.
 */
export function SessionVaultEnrollPrompt({
  open,
  title = 'Stay unlocked on this device?',
  body = 'Use Face ID, fingerprint, or your device passcode next time instead of re-entering your keys. You can turn this off anytime by signing out.',
  confirmLabel = 'Enable',
  declineLabel = 'Not now',
  busy = false,
  error = null,
  onConfirm,
  onDecline,
}: SessionVaultEnrollPromptProps) {
  if (!open) return null;
  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" aria-labelledby="pn-vault-enroll-title">
      <div style={cardStyle}>
        <h2 id="pn-vault-enroll-title" style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 600 }}>
          {title}
        </h2>
        <p style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.45, color: '#c4c4c4' }}>{body}</p>
        {error ? (
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#f87171' }}>{error}</p>
        ) : null}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onDecline}
            disabled={busy}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid #444',
              background: 'transparent',
              color: '#ddd',
              cursor: 'pointer',
            }}
          >
            {declineLabel}
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={busy}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: 'none',
              background: '#f5f5f5',
              color: '#111',
              fontWeight: 600,
              cursor: 'pointer',
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? 'Enabling…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export interface SessionVaultUnlockOverlayProps {
  open: boolean;
  title?: string;
  body?: string;
  unlockLabel?: string;
  useFullUnlockLabel?: string;
  busy?: boolean;
  error?: string | null;
  onUnlock: () => void | Promise<void>;
  onUseFullUnlock: () => void;
  children?: ReactNode;
}

/**
 * Cold-start overlay: unlock with biometrics or fall back to full unlock.
 */
export function SessionVaultUnlockOverlay({
  open,
  title = 'Unlock',
  body = 'Use Face ID, fingerprint, or your device passcode to continue.',
  unlockLabel = 'Unlock with biometrics',
  useFullUnlockLabel = 'Use full unlock instead',
  busy = false,
  error = null,
  onUnlock,
  onUseFullUnlock,
}: SessionVaultUnlockOverlayProps) {
  if (!open) return null;
  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" aria-labelledby="pn-vault-unlock-title">
      <div style={cardStyle}>
        <h2 id="pn-vault-unlock-title" style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 600 }}>
          {title}
        </h2>
        <p style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.45, color: '#c4c4c4' }}>{body}</p>
        {error ? (
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#f87171' }}>{error}</p>
        ) : null}
        <button
          type="button"
          onClick={() => void onUnlock()}
          disabled={busy}
          style={{
            width: '100%',
            padding: '10px 14px',
            borderRadius: 8,
            border: 'none',
            background: '#f5f5f5',
            color: '#111',
            fontWeight: 600,
            cursor: 'pointer',
            marginBottom: 8,
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? 'Unlocking…' : unlockLabel}
        </button>
        <button
          type="button"
          onClick={onUseFullUnlock}
          disabled={busy}
          style={{
            width: '100%',
            padding: '8px 14px',
            borderRadius: 8,
            border: '1px solid #444',
            background: 'transparent',
            color: '#ddd',
            cursor: 'pointer',
          }}
        >
          {useFullUnlockLabel}
        </button>
      </div>
    </div>
  );
}

export type SessionVaultPickerOption = {
  identityId: string;
  /** Safe display label (never Key 1 / passcode). */
  label: string;
};

export interface SessionVaultIdentityPickerProps {
  open: boolean;
  title?: string;
  body?: string;
  options: SessionVaultPickerOption[];
  busy?: boolean;
  error?: string | null;
  onSelect: (identityId: string) => void | Promise<void>;
  onCancel: () => void;
  cancelLabel?: string;
}

/**
 * After biometric: pick which enrolled pN to continue with.
 */
export function SessionVaultIdentityPicker({
  open,
  title = 'Choose a pN',
  body = 'Select which saved identity to unlock.',
  options,
  busy = false,
  error = null,
  onSelect,
  onCancel,
  cancelLabel = 'Cancel',
}: SessionVaultIdentityPickerProps) {
  if (!open) return null;
  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" aria-labelledby="pn-vault-pick-title">
      <div style={cardStyle}>
        <h2 id="pn-vault-pick-title" style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 600 }}>
          {title}
        </h2>
        <p style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.45, color: '#c4c4c4' }}>{body}</p>
        {error ? (
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#f87171' }}>{error}</p>
        ) : null}
        <ul
          style={{
            listStyle: 'none',
            margin: '0 0 16px',
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {options.map((opt) => (
            <li key={opt.identityId}>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onSelect(opt.identityId)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid #444',
                  background: '#222',
                  color: '#f5f5f5',
                  cursor: 'pointer',
                  fontWeight: 500,
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          style={{
            width: '100%',
            padding: '8px 14px',
            borderRadius: 8,
            border: '1px solid #444',
            background: 'transparent',
            color: '#ddd',
            cursor: 'pointer',
          }}
        >
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}
