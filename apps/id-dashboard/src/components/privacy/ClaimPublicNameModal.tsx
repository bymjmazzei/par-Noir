import React, { useCallback, useState } from 'react';
import { X, Globe, Youtube, CheckCircle, Loader2, Copy } from 'lucide-react';
import { getGoogleDriveClientId } from '../../config/googleDriveClientId';
import { API_ENDPOINT } from '../../config/api';
import {
  startDnsVerification,
  verifyDns,
  completeYoutube,
  listPublicName,
  type PublicNameDto,
} from '../../services/publicNamesApi';

type Step = 'choose' | 'dns' | 'dns_pending' | 'youtube' | 'done';

interface ClaimPublicNameModalProps {
  isOpen: boolean;
  onClose: () => void;
  accessToken: string;
  pnIdentifier: string;
  onChanged: () => void;
}

async function exchangeGoogleCode(
  code: string,
  redirectUri: string
): Promise<string> {
  const res = await fetch(`${API_ENDPOINT}/api/auth/google-oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, redirectUri }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(
      (j as { message?: string; error?: string }).message ||
        (j as { error?: string }).error ||
        'Google token exchange failed'
    );
  }
  const data = (await res.json()) as { access_token?: string; accessToken?: string };
  const token = data.access_token || data.accessToken;
  if (!token) throw new Error('No access token from Google');
  return token;
}

function openYoutubeOAuthPopup(): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      const clientId = import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID || (await getGoogleDriveClientId());
      if (!clientId) {
        reject(new Error('Google client ID not configured'));
        return;
      }
      const redirectUri = `${window.location.origin}/oauth-callback.html`;
      const scope = 'https://www.googleapis.com/auth/youtube.readonly';
      const authUrl =
        `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent(scope)}` +
        `&access_type=online` +
        `&prompt=consent` +
        `&state=${encodeURIComponent('pn_youtube_public_name')}`;

      const popup = window.open(authUrl, 'pn_youtube_oauth', 'width=520,height=680');
      if (!popup) {
        reject(new Error('Popup blocked. Allow popups and try again.'));
        return;
      }

      const timeout = window.setTimeout(() => {
        window.removeEventListener('message', onMessage);
        reject(new Error('OAuth timeout — please try again'));
      }, 300000);

      const onMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        const data = event.data as { type?: string; code?: string; error?: string };
        if (data?.type !== 'GOOGLE_OAUTH_CODE' && data?.type !== 'oauth_callback') return;
        window.clearTimeout(timeout);
        window.removeEventListener('message', onMessage);
        if (data.error) {
          reject(new Error(data.error));
          return;
        }
        if (!data.code) {
          reject(new Error('No authorization code received'));
          return;
        }
        exchangeGoogleCode(data.code, redirectUri).then(resolve).catch(reject);
      };
      window.addEventListener('message', onMessage);
    } catch (e) {
      reject(e);
    }
  });
}

export const ClaimPublicNameModal: React.FC<ClaimPublicNameModalProps> = ({
  isOpen,
  onClose,
  accessToken,
  pnIdentifier,
  onChanged,
}) => {
  const [step, setStep] = useState<Step>('choose');
  const [domain, setDomain] = useState('');
  const [dnsInfo, setDnsInfo] = useState<{
    token: string;
    domain: string;
    dnsName: string;
    wellKnownUrl: string;
    candidateName: string;
  } | null>(null);
  const [proven, setProven] = useState<PublicNameDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const reset = useCallback(() => {
    setStep('choose');
    setDomain('');
    setDnsInfo(null);
    setProven(null);
    setLoading(false);
    setError(null);
    setCopied(false);
  }, []);

  const handleClose = () => {
    reset();
    onClose();
  };

  if (!isOpen) return null;

  const startDns = async () => {
    setError(null);
    setLoading(true);
    try {
      const info = await startDnsVerification(accessToken, pnIdentifier, domain);
      setDnsInfo(info);
      setStep('dns_pending');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start DNS verification');
    } finally {
      setLoading(false);
    }
  };

  const doVerifyDns = async () => {
    if (!dnsInfo) return;
    setError(null);
    setLoading(true);
    try {
      const row = await verifyDns(accessToken, pnIdentifier, dnsInfo.domain);
      setProven(row);
      setStep('done');
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'DNS verification failed');
    } finally {
      setLoading(false);
    }
  };

  const doYoutube = async () => {
    setError(null);
    setLoading(true);
    try {
      const googleToken = await openYoutubeOAuthPopup();
      const row = await completeYoutube(accessToken, pnIdentifier, googleToken);
      setProven(row);
      setStep('done');
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'YouTube verification failed');
    } finally {
      setLoading(false);
    }
  };

  const addToDirectory = async () => {
    if (!proven) return;
    setError(null);
    setLoading(true);
    try {
      const row = await listPublicName(accessToken, pnIdentifier, proven.publicName);
      setProven(row);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add to directory');
    } finally {
      setLoading(false);
    }
  };

  const copyToken = async () => {
    if (!dnsInfo) return;
    await navigator.clipboard.writeText(dnsInfo.token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-secondary border border-border rounded-xl w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-lg font-semibold text-text-primary">Claim public name</h3>
          <button type="button" onClick={handleClose} className="text-text-secondary hover:text-text-primary">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {error && (
            <div className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-lg p-3">
              {error}
            </div>
          )}

          {step === 'choose' && (
            <>
              <p className="text-sm text-text-secondary">
                Prove control of your domain or a YouTube channel with a public @handle. You can add the
                resulting name to people search afterward.
              </p>
              <button
                type="button"
                onClick={() => setStep('dns')}
                className="w-full flex items-center gap-3 p-4 rounded-lg border border-border hover:bg-border/40 text-left"
              >
                <Globe className="w-5 h-5 text-blue-400 shrink-0" />
                <div>
                  <div className="font-medium text-text-primary">Verify via DNS</div>
                  <div className="text-xs text-text-secondary">
                    Claim the registrable label of your domain (mjmazzei.com → mjmazzei)
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep('youtube');
                  void doYoutube();
                }}
                disabled={loading}
                className="w-full flex items-center gap-3 p-4 rounded-lg border border-border hover:bg-border/40 text-left disabled:opacity-50"
              >
                <Youtube className="w-5 h-5 text-red-400 shrink-0" />
                <div>
                  <div className="font-medium text-text-primary">Verify via YouTube</div>
                  <div className="text-xs text-text-secondary">
                    Link Google and claim your channel @handle
                  </div>
                </div>
              </button>
            </>
          )}

          {step === 'dns' && (
            <>
              <label className="block text-sm text-text-secondary">
                Domain
                <input
                  type="text"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="example.com"
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-bg-primary border border-border text-text-primary placeholder:text-text-secondary [color-scheme:dark] autofill:bg-bg-primary"
                />
              </label>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setStep('choose')}
                  className="px-3 py-2 text-sm text-text-secondary"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={loading || !domain.trim()}
                  onClick={() => void startDns()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {loading ? 'Starting…' : 'Continue'}
                </button>
              </div>
            </>
          )}

          {step === 'dns_pending' && dnsInfo && (
            <>
              <p className="text-sm text-text-secondary">
                Candidate public name: <span className="text-text-primary font-medium">{dnsInfo.candidateName}</span>
              </p>
              <p className="text-sm text-text-secondary">
                Add this token as a DNS TXT record at <code className="text-xs">{dnsInfo.dnsName}</code>, or
                as the body of <code className="text-xs break-all">{dnsInfo.wellKnownUrl}</code>:
              </p>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-bg-primary border border-border">
                <code className="text-xs text-text-primary break-all flex-1 select-all">{dnsInfo.token}</code>
                <button type="button" onClick={() => void copyToken()} className="shrink-0 text-text-secondary hover:text-text-primary">
                  {copied ? <CheckCircle className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setStep('dns')} className="px-3 py-2 text-sm text-text-secondary">
                  Back
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void doVerifyDns()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Verify
                </button>
              </div>
            </>
          )}

          {step === 'youtube' && loading && (
            <div className="flex items-center gap-2 text-sm text-text-secondary py-8 justify-center">
              <Loader2 className="w-5 h-5 animate-spin" />
              Waiting for Google / YouTube…
            </div>
          )}

          {step === 'done' && proven && (
            <>
              <div className="flex items-start gap-3 p-3 rounded-lg border border-green-800 bg-green-950/30">
                <CheckCircle className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium text-text-primary">Proven: {proven.publicName}</div>
                  <div className="text-xs text-text-secondary mt-1">
                    via {proven.proofType === 'dns' ? 'DNS' : 'YouTube'} · status {proven.status}
                  </div>
                </div>
              </div>
              {proven.status !== 'listed' ? (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void addToDirectory()}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {loading ? 'Adding…' : 'Add to search directory'}
                </button>
              ) : (
                <p className="text-sm text-text-secondary">
                  This name is in the people-search directory. You can set it as your profile URL from the Public
                  names section.
                </p>
              )}
              <button
                type="button"
                onClick={handleClose}
                className="w-full px-4 py-2 border border-border rounded-lg text-sm text-text-primary"
              >
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
