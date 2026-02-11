/**
 * Licensing — par Noir
 * Splash page for rights holders. Deployed at licensing.parnoir.com
 */

import React, { useState } from 'react';
import { FileCheck, Percent, Shield } from 'lucide-react';

const PARTNER_TYPES = [
  'Label',
  'Music Publisher',
  'Independent Artist',
  'Catalog Owner',
  'Distributor',
  'Other',
];

export default function App() {
  const [form, setForm] = useState({
    name: '',
    partnerType: '',
    title: '',
    phone: '',
    email: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = [
      `Name: ${form.name}`,
      `Partner type: ${form.partnerType || '(not selected)'}`,
      `Title: ${form.title}`,
      `Phone: ${form.phone}`,
      `Email: ${form.email}`,
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
        backgroundPosition: 'center',
      }}
    >
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div className="relative z-10">
        {/* Header */}
        <header className="border-b border-white/10 px-6 py-4 backdrop-blur-sm">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <a
                href="https://parnoir.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 hover:opacity-90 transition-opacity"
              >
                <img
                  src="/branding/Par-Noir-Logo-White.png"
                  alt="par Noir"
                  className="h-8 object-contain"
                />
              </a>
              <span className="text-xl font-semibold tracking-tight">Licensing</span>
            </div>
          </div>
        </header>

        {/* Hero */}
        <main className="max-w-2xl mx-auto px-6 py-16 md:py-24">
          <div className="text-center space-y-8">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              License your music and sounds for the par Noir ecosystem.
            </h1>
            <p className="text-lg text-neutral-300 leading-relaxed">
              Rights holders grant use of their media in exchange for a share of
              each post&apos;s monetization. One agreement, clear terms, automated
              reporting.
            </p>

            {/* Feature tiles: 2-col per tile — icon left, title+text right */}
            <div className="grid gap-4 py-8 md:grid-cols-3 text-left">
              <div className="bg-neutral-900/60 border border-white/10 rounded-lg p-4 backdrop-blur-sm flex items-center gap-3">
                <div className="flex-shrink-0 w-10">
                  <FileCheck className="h-8 w-8 text-neutral-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold mb-1">License your media</h2>
                  <p className="text-sm text-neutral-400 leading-snug">
                    Contribute tracks to the licensed library; clear terms, one
                    agreement.
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
                    User-owned identity and content; transparent, automated
                    reporting.
                  </p>
                </div>
              </div>
            </div>

            {/* Contact form */}
            <section className="pt-8 border-t border-white/10">
              <h2 className="text-xl font-semibold mb-4">Get in touch</h2>
              <form
                onSubmit={handleSubmit}
                className="space-y-4 max-w-md mx-auto text-left"
              >
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
          </div>
        </footer>
      </div>
    </div>
  );
}
