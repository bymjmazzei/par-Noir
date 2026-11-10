/**
 * FTP setup: the user hosts apps/pn-storage-relay with their FTPS/SFTP login in
 * its environment. This flow generates the relay's settings, tests it from the
 * browser, and seals the relay URL and token on this device.
 */
import React, { useMemo, useState } from 'react';
import { Check, Copy, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import type { StorageCredentialsEnvelope } from '@par-noir/user-owned-storage';
import {
  describeRelayProbeFailure,
  generateRelayToken,
  relayAllowedOrigins,
  relayDockerCommands,
  relayEnvVars,
  relayPrefixFor,
  saveRelayConnection,
} from '../../services/storage/relaySetup';

const RAILWAY_TEMPLATE_URL = (import.meta.env.VITE_RELAY_RAILWAY_TEMPLATE_URL as string | undefined)?.trim() || '';

interface RelaySetupFlowProps {
  pnIdentifier: string;
  sealToVault: (envelope: StorageCredentialsEnvelope) => Promise<void>;
  putLayout: (body: { provider: 'relay'; relay: { accountId: string; prefix: string } }) => Promise<{
    socialCloudProvider?: string;
    accountId?: string;
  }>;
  initializeLayout: (envelope: StorageCredentialsEnvelope) => Promise<void>;
  onSaved: (isSocialCloud: boolean) => void;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="shrink-0 p-1 text-text-secondary hover:text-text-primary"
      aria-label="Copy"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export function RelaySetupFlow({ pnIdentifier, sealToVault, putLayout, initializeLayout, onSaved }: RelaySetupFlowProps) {
  const [token, setToken] = useState(generateRelayToken);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState<'test' | 'save' | null>(null);
  const [tested, setTested] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const prefix = relayPrefixFor(pnIdentifier);
  const vars = useMemo(
    () => relayEnvVars({ token, prefix, origins: relayAllowedOrigins(window.location.origin) }),
    [token, prefix]
  );
  const testedOk = tested !== null && tested === `${url.trim()}|${token}`;

  const test = async () => {
    setBusy('test');
    setError(null);
    setTested(null);
    try {
      const { probeRelay } = await import('@par-noir/device-cloud-credentials');
      const result = await probeRelay({ url, token, prefix });
      if (result.ok) setTested(`${url.trim()}|${token}`);
      else setError(describeRelayProbeFailure(result));
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setBusy('save');
    setError(null);
    try {
      const { isSocialCloud } = await saveRelayConnection(
        { pnIdentifier, url, token },
        { persistVault: sealToVault, putLayout, initializeLayout }
      );
      onSaved(isSocialCloud);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Saving the relay failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4 text-sm text-text-secondary">
      <p>
        FTP storage runs through a small relay you host. Your FTP username and password go only into the relay's
        settings on your host. par Noir never sees them, and this device keeps just the relay address and token.
        Use SFTP or FTPS; plain FTP is refused.
      </p>

      <div>
        <div className="flex items-center justify-between mb-1">
          <h4 className="font-medium text-text-primary">1. Relay settings</h4>
          <button
            type="button"
            onClick={() => {
              setToken(generateRelayToken());
              setTested(null);
            }}
            className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600"
          >
            <RefreshCw className="h-3 w-3" /> New token
          </button>
        </div>
        <ul className="space-y-1 font-mono text-xs">
          {vars.map((v) => (
            <li key={v.name} className="flex items-center gap-2 rounded border border-border px-2 py-1">
              <span className="text-text-primary">{v.name}</span>
              <span className={`truncate ${v.userSupplied ? 'italic' : ''}`}>{v.value}</span>
              {!v.userSupplied && <span className="ml-auto"><CopyButton text={v.value} /></span>}
            </li>
          ))}
        </ul>
        <p className="mt-1 text-xs">Enter your own server, username and password on the relay host only.</p>
      </div>

      <div>
        <h4 className="font-medium text-text-primary mb-1">2. Deploy the relay</h4>
        {RAILWAY_TEMPLATE_URL ? (
          <a
            href={RAILWAY_TEMPLATE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm mb-2"
          >
            Deploy on Railway <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
        <p className="text-xs mb-1">Or on any host with Docker (put it behind HTTPS):</p>
        <div className="relative">
          <pre className="overflow-x-auto rounded border border-border p-2 text-xs">{relayDockerCommands(vars)}</pre>
          <span className="absolute top-1 right-1"><CopyButton text={relayDockerCommands(vars)} /></span>
        </div>
      </div>

      <div>
        <h4 className="font-medium text-text-primary mb-1">3. Relay address</h4>
        <input
          className="input-dark"
          placeholder="https://your-relay.up.railway.app"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!url.trim() || busy !== null}
          onClick={test}
          className="px-4 py-2 rounded-lg border border-border text-text-primary disabled:opacity-50"
        >
          {busy === 'test' ? <Loader2 className="h-4 w-4 animate-spin inline" /> : 'Test relay'}
        </button>
        <button
          type="button"
          disabled={!testedOk || busy !== null}
          onClick={save}
          className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50"
        >
          {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin inline" /> : 'Save relay'}
        </button>
      </div>
      {testedOk && <p className="text-green-600">Relay works: it wrote, read and deleted a test file.</p>}
      {error && <p className="text-red-500">{error}</p>}
    </div>
  );
}
