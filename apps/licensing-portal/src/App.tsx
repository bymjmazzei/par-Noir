/**
 * Licensing — par Noir
 * Rights-holder intake + authenticated track registry (creator fund / music pool).
 */

import React, { useMemo, useState } from 'react';
import { FileCheck, Percent, Shield, LogOut } from 'lucide-react';
import { UnlockButton } from '@par-noir/oauth-ui';
import { API_ENDPOINT } from './config/api';
import { PN_CLIENT_ID } from './config/client';
import { LicensingSessionProvider, useLicensingSession } from './context/LicensingSessionContext';
import { TrackLibraryPanel } from './components/TrackLibraryPanel';

const PARTNER_TYPES = [
  'Label',
  'Music Publisher',
  'Independent Artist',
  'Catalog Owner',
  'Distributor',
  'Other'
];

function getLicensingOAuthConfig() {
  return {
    clientId: PN_CLIENT_ID,
    apiEndpoint: API_ENDPOINT,
    redirectUri: `${typeof window !== 'undefined' ? window.location.origin : ''}/oauth-callback.html`,
    scope: ['openid', 'profile', 'zkp:age_attestation'] as const
  };
}

function LicensingShell() {
  const { loadingSession, signedIn, error, setError, handleBeforeUnlock, onPopupResult, signOut } =
    useLicensingSession();
  const oauthConfig = useMemo(() => getLicensingOAuthConfig(), []);
  const [form, setForm] = useState({
    name: '',
    partnerType: '',
    title: '',
    phone: '',
    email: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = [
      `Name: ${form.name}`,
      `Partner type: ${form.partnerType || '(not selected)'}`,
      `Title: ${form.title}`,
      `Phone: ${form.phone}`,
      `Email: ${form.email}`
    ].join('\n');
    const mailto = `mailto:parnoirdashboard@gmail.com?subject=Licensing partner inquiry&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
  };

  return (
    <div
      className="min-h-screen text-white relative"
      style={{
        backgroundImage: 'url(/branding/Par-Noir-Background-Dark.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div className="relative z-10">
        <header className="border-b border-white/10 px-6 py-4 backdrop-blur-sm">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <a
                href="https://parnoir.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 hover:opacity-90 transition-opacity shrink-0"
              >
                <img
                  src="/branding/Par-Noir-Logo-White.png"
                  alt="par Noir"
                  className="h-8 object-contain"
                />
              </a>
              <span className="text-xl font-semibold tracking-tight truncate">Licensing</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {loadingSession ? (
                <span className="text-sm text-neutral-400">Loading…</span>
              ) : signedIn ? (
                <>
                  <span className="text-xs text-neutral-400 hidden sm:inline">Signed in</span>
                  <button
                    type="button"
                    onClick={() => void signOut()}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/20 text-sm text-white/90 hover:bg-white/10"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </>
              ) : (
                <UnlockButton
                  config={oauthConfig}
                  onBeforeNavigate={handleBeforeUnlock}
                  onPopupResult={(r) => void onPopupResult(r)}
                  onPopupFlowFailed={() => setError('Sign-in window was blocked or closed.')}
                  className="px-4 py-2 rounded-lg border border-white/30 text-sm font-medium text-white hover:bg-white/10"
                >
                  Sign in with pN
                </UnlockButton>
              )}
            </div>
          </div>
        </header>

        {error && (
          <div className="max-w-4xl mx-auto px-6 pt-4">
            <div className="rounded-lg border border-amber-500/40 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
              {error}
            </div>
          </div>
        )}

        {signedIn && <TrackLibraryPanel />}

        <main className="max-w-2xl mx-auto px-6 py-16 md:py-24">
          <div className="text-center space-y-8">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              License your music and sounds for the par Noir ecosystem.
            </h1>
            <p className="text-lg text-neutral-300 leading-relaxed">
              Rights holders grant use of their media in exchange for a share of each post&apos;s
              monetization. One agreement, clear terms, automated reporting.
            </p>

            <div className="grid gap-4 py-8 md:grid-cols-3 text-left">
              <div className="bg-neutral-900/60 border border-white/10 rounded-lg p-4 backdrop-blur-sm flex items-center gap-3">
                <div className="flex-shrink-0 w-10">
                  <FileCheck className="h-8 w-8 text-neutral-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold mb-1">License your media</h2>
                  <p className="text-sm text-neutral-400 leading-snug">
                    Contribute tracks to the licensed library; clear terms, one agreement.
                  </p>
                </div>
              </div>
              <div className="bg-neutral-900/60 border border-white/10 rounded-lg p-4 backdrop-blur-sm flex items-center gap-3">
                <div className="flex-shrink-0 w-10">
                  <Percent className="h-8 w-8 text-neutral-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold mb-1">Earn from usage</h2>
                  <p className="text-sm text-neutral-400 leading-snug">
                    Revenue share from posts that use your media across the ecosystem.
                  </p>
                </div>
              </div>
              <div className="bg-neutral-900/60 border border-white/10 rounded-lg p-4 backdrop-blur-sm flex items-center gap-3">
                <div className="flex-shrink-0 w-10">
                  <Shield className="h-8 w-8 text-neutral-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold mb-1">Built on par Noir</h2>
                  <p className="text-sm text-neutral-400 leading-snug">
                    User-owned identity and content; transparent, automated reporting.
                  </p>
                </div>
              </div>
            </div>

            <section id="partner-inquiry" className="pt-8 border-t border-white/10 text-left">
              <h2 className="text-xl font-semibold mb-4 text-center">Get in touch</h2>
              <p className="text-sm text-neutral-400 mb-4 text-center">
                New partnership or contract questions? Use this form. Catalog updates use{' '}
                <strong className="text-neutral-200">Sign in with pN</strong> above.
              </p>
              <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto">
                <div>
                  <label htmlFor="name" className="block text-sm text-neutral-400 mb-1">
                    Name
                  </label>
                  <input
                    id="name"
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-neutral-900/80 border border-white/20 text-white placeholder-neutral-500 focus:outline-none focus:border-white/40"
                    placeholder="Your name"
                  />
                </div>
                <div>
                  <label htmlFor="partnerType" className="block text-sm text-neutral-400 mb-1">
                    Partner type
                  </label>
                  <select
                    id="partnerType"
                    value={form.partnerType}
                    onChange={(e) => setForm((f) => ({ ...f, partnerType: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-neutral-900/80 border border-white/20 text-white focus:outline-none focus:border-white/40"
                  >
                    <option value="">Select...</option>
                    {PARTNER_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="title" className="block text-sm text-neutral-400 mb-1">
                    Title
                  </label>
                  <input
                    id="title"
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-neutral-900/80 border border-white/20 text-white placeholder-neutral-500 focus:outline-none focus:border-white/40"
                    placeholder="Job title"
                  />
                </div>
                <div>
                  <label htmlFor="phone" className="block text-sm text-neutral-400 mb-1">
                    Phone
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-neutral-900/80 border border-white/20 text-white placeholder-neutral-500 focus:outline-none focus:border-white/40"
                    placeholder="Phone number"
                  />
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm text-neutral-400 mb-1">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-neutral-900/80 border border-white/20 text-white placeholder-neutral-500 focus:outline-none focus:border-white/40"
                    placeholder="Email address"
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="w-full px-4 py-3 border border-white/30 text-white font-medium rounded-lg hover:bg-white/10 transition-colors"
                >
                  Submit
                </button>
              </form>
            </section>
          </div>
        </main>

        <footer className="border-t border-white/10 mt-24 py-8 px-6 backdrop-blur-sm">
          <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-neutral-400">
            <span>Licensing · par Noir infrastructure</span>
            <a
              href="https://parnoir.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-neutral-300 transition-colors"
            >
              parnoir.com
            </a>
            <a
              href="https://browse.parnoir.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-neutral-300 transition-colors"
            >
              browse.parnoir.com
            </a>
            <a href="#partner-inquiry" className="hover:text-neutral-300 transition-colors">
              Partner inquiry
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <LicensingSessionProvider>
      <LicensingShell />
    </LicensingSessionProvider>
  );
}
