/**
 * Visual SoT: api/src/templates/oauth-consent.html
 * Injected so ConsentUnlockApp matches the OAuth popup chrome exactly.
 */
export function consentUnlockCss(assetBase: string, backgroundUrl?: string): string {
  const base = assetBase.replace(/\/$/, '') || '';
  // Prefer explicit URL (Electron Vite asset). Quote for file:// paths with spaces.
  const bgCss = backgroundUrl
    ? `background-color: #000;`
    : `background: #000 url("${base}/branding/Par-Noir-Background-Dark.png") center/cover no-repeat;`;
  return `
.pn-consent-page * { margin: 0; padding: 0; box-sizing: border-box; }
.pn-consent-page {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  ${bgCss}
  color: #fff;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
  position: relative;
}
.pn-consent-page .pn-consent-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 0;
  pointer-events: none;
}
.pn-consent-page::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: 1;
  pointer-events: none;
}
.pn-consent-page .container {
  width: 100%;
  max-width: 420px;
  position: relative;
  z-index: 2;
}
.pn-consent-page .header {
  text-align: center;
  margin-bottom: 40px;
}
.pn-consent-page .logo-container {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: 16px;
  width: 120px;
  height: 120px;
  margin-left: auto;
  margin-right: auto;
  overflow: hidden;
}
.pn-consent-page .logo-container img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  clip-path: inset(15% 0 15% 0);
}
.pn-consent-page .form-container {
  background: rgba(26, 26, 26, 0.95);
  border: 1px solid #333;
  border-radius: 12px;
  padding: 32px;
  backdrop-filter: blur(10px);
}
.pn-consent-page .step-indicator {
  text-align: center;
  color: #fff;
  font-size: 12px;
  margin-bottom: 24px;
  text-transform: uppercase;
  letter-spacing: 1px;
}
.pn-consent-page .form-group {
  margin-bottom: 24px;
  position: relative;
}
.pn-consent-page label {
  display: block;
  color: #e5e7eb;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 8px;
}
.pn-consent-page .file-upload-area {
  border: 2px dashed #4b5563;
  border-radius: 8px;
  padding: 16px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  background: rgba(26, 26, 26, 0.95);
}
.pn-consent-page .file-upload-area:hover {
  border-color: #6b7280;
  background: rgba(31, 31, 31, 0.95);
}
.pn-consent-page .file-upload-area.has-file {
  border-color: #3b82f6;
  background: rgba(26, 26, 26, 0.95);
}
.pn-consent-page .upload-icon {
  font-size: 32px;
  margin-bottom: 8px;
  color: #6b7280;
}
.pn-consent-page .file-upload-area.has-file .upload-icon { color: #3b82f6; }
.pn-consent-page .file-name {
  color: #e5e7eb;
  font-weight: 500;
  margin-bottom: 4px;
}
.pn-consent-page .file-hint { color: #6b7280; font-size: 12px; }
.pn-consent-page input[type="file"] { display: none; }
.pn-consent-page .input-wrapper { position: relative; }
.pn-consent-page input[type="text"],
.pn-consent-page input[type="password"] {
  width: 100%;
  padding: 12px 40px 12px 16px;
  background: rgba(26, 26, 26, 0.95);
  border: 1px solid #333;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  transition: all 0.2s;
}
.pn-consent-page input[type="text"]:focus,
.pn-consent-page input[type="password"]:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}
.pn-consent-page input::placeholder { color: #6b7280; }
.pn-consent-page .eye-toggle {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: #6b7280;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;
  flex: none;
  width: auto;
}
.pn-consent-page .eye-toggle:hover { color: #9ca3af; }
.pn-consent-page .eye-toggle svg { width: 20px; height: 20px; }
.pn-consent-page .error {
  background: #7f1d1d;
  border: 1px solid #991b1b;
  color: #fca5a5;
  padding: 12px;
  border-radius: 8px;
  font-size: 14px;
  margin-bottom: 16px;
}
.pn-consent-page .button-group {
  display: flex;
  gap: 12px;
  margin-top: 32px;
}
.pn-consent-page button {
  flex: 1;
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}
.pn-consent-page button:disabled { opacity: 0.5; cursor: not-allowed; }
.pn-consent-page .btn-cancel {
  background: rgba(26, 26, 26, 0.95);
  border: 1px solid #4b5563;
  color: #fff;
}
.pn-consent-page .btn-cancel:hover:not(:disabled) {
  background: rgba(31, 31, 31, 0.95);
  border-color: #6b7280;
}
.pn-consent-page .btn-primary {
  background: rgba(26, 26, 26, 0.95);
  border: 1px solid #4b5563;
  color: #fff;
}
.pn-consent-page .btn-primary:hover:not(:disabled) {
  background: rgba(31, 31, 31, 0.95);
  border-color: #6b7280;
}
.pn-consent-page .btn-full { width: 100%; flex: none; }
.pn-consent-page .mode-row {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}
.pn-consent-page .mode-btn {
  flex: 1;
  padding: 10px 8px;
  font-size: 13px;
  background: rgba(40, 40, 40, 0.95);
  border: 1px solid #444;
  color: #9ca3af;
}
.pn-consent-page .mode-btn.active {
  border-color: #3b82f6;
  color: #fff;
  background: rgba(30, 58, 138, 0.35);
}
.pn-consent-page .physical-hint {
  color: #6b7280;
  font-size: 12px;
  margin-bottom: 12px;
  line-height: 1.4;
}
.pn-consent-page .nfc-status {
  font-size: 13px;
  color: #9ca3af;
  margin-bottom: 8px;
  min-height: 1.2em;
}
.pn-consent-page .nfc-status.ok { color: #86efac; }
.pn-consent-page .loading {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: pn-consent-spin 0.6s linear infinite;
  margin-right: 8px;
  vertical-align: middle;
}
@keyframes pn-consent-spin { to { transform: rotate(360deg); } }
.pn-consent-page .permissions-list {
  background: rgba(26, 26, 26, 0.95);
  border: 1px solid #333;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 24px;
}
.pn-consent-page .permission-item {
  display: flex;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid #1f2937;
  gap: 12px;
}
.pn-consent-page .permission-item:last-child { border-bottom: none; }
.pn-consent-page .permission-text { flex: 1; }
.pn-consent-page .permission-title {
  color: #e5e7eb;
  font-weight: 500;
  font-size: 14px;
  margin-bottom: 2px;
}
.pn-consent-page .permission-desc { color: #6b7280; font-size: 12px; }
.pn-consent-page .permission-select {
  padding: 8px 12px;
  background: rgba(26, 26, 26, 0.95);
  border: 1px solid #333;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  min-width: 120px;
  flex: none;
}
.pn-consent-page .required-badge {
  color: #ef4444;
  font-size: 12px;
  font-weight: 500;
  margin-left: 4px;
}
.pn-consent-page .app-info {
  background: rgba(26, 26, 26, 0.95);
  border: 1px solid #333;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 24px;
  display: flex;
  align-items: center;
}
.pn-consent-page .app-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 12px;
  flex-shrink: 0;
}
.pn-consent-page .app-icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.pn-consent-page .app-name {
  color: #e5e7eb;
  font-weight: 500;
  font-size: 16px;
  margin-bottom: 2px;
}
.pn-consent-page .app-url { color: #6b7280; font-size: 12px; }
`;
}

export function resolveConsentAssetBase(explicit?: string): string {
  if (explicit && explicit.trim()) return explicit.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin;
    // Electron / Capacitor file loads: origin is "file://" or "null" — relative assets.
    if (!origin || origin === 'null' || origin === 'file://' || origin.startsWith('file:')) {
      return '.';
    }
    return origin.replace(/\/$/, '');
  }
  return 'https://browse.parnoir.com';
}

/** Tighter chrome for native Unlock brokers (no scroll at default window size). */
export function consentUnlockBrokerCssExtras(): string {
  return `
.pn-consent-page.pn-consent-broker {
  min-height: 100%;
  height: 100%;
  padding: 16px 16px;
  overflow: hidden;
  justify-content: flex-start;
}
.pn-consent-page.pn-consent-broker::before {
  background: rgba(0, 0, 0, 0.4);
}
.pn-consent-page.pn-consent-broker .container {
  max-width: 340px;
}
.pn-consent-page.pn-consent-broker .header {
  margin-bottom: 16px;
}
.pn-consent-page.pn-consent-broker .logo-container {
  width: 88px;
  height: 88px;
  margin-bottom: 0;
}
.pn-consent-page.pn-consent-broker .form-container {
  padding: 20px 20px 22px;
}
.pn-consent-page.pn-consent-broker .form-group {
  margin-bottom: 14px;
}
.pn-consent-page.pn-consent-broker .mode-row {
  margin-bottom: 14px;
}
.pn-consent-page.pn-consent-broker .button-group {
  margin-top: 18px;
}
.pn-consent-page.pn-consent-broker .file-upload-area {
  padding: 12px;
}
.pn-consent-page.pn-consent-broker .upload-icon {
  font-size: 24px;
  margin-bottom: 4px;
}
.pn-consent-page .handoff-done {
  text-align: center;
  font-size: 18px;
  font-weight: 600;
  color: #e5e7eb;
  margin-bottom: 10px;
}
.pn-consent-page .handoff-done-hint {
  text-align: center;
  font-size: 13px;
  line-height: 1.45;
  color: #9ca3af;
  margin: 0;
}
`;
}
