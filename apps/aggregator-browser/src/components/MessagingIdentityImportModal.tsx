/**
 * Load messaging keys from a pN identity file on this device (bypasses OAuth handoff).
 */

import React, { useRef, useState } from 'react';
import { FileKey } from 'lucide-react';
import { importMessagingIdentityFromFile } from '../services/messagingIdentityImport';

interface MessagingIdentityImportModalProps {
  onImported: () => void;
  onCancel?: () => void;
}

export function MessagingIdentityImportModal({
  onImported,
  onCancel,
}: MessagingIdentityImportModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pnName, setPnName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Select your pN identity file');
      return;
    }
    if (!pnName.trim()) {
      setError('Enter your pN name');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await importMessagingIdentityFromFile(file, pnName, passcode);
      setPasscode('');
      onImported();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Import failed';
      if (msg.toLowerCase().includes('ml-kem') || msg.toLowerCase().includes('messaging')) {
        setError(
          'This identity file has no messaging keys. Create or update your identity at pn.parnoir.com, then try again.'
        );
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-2 text-white">
          <FileKey className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Load identity file</h2>
        </div>
        <p className="mb-4 text-sm text-neutral-400">
          Select your pN identity file and enter your pN name and passcode. Keys stay on this device.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            ref={fileRef}
            type="file"
            accept=".json,.pn,.id,.identity,application/json"
            className="hidden"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setError(null);
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full rounded-lg border border-dashed border-neutral-600 bg-neutral-800/50 px-3 py-3 text-left text-sm text-neutral-200 hover:border-neutral-500"
            disabled={loading}
          >
            {file ? file.name : 'Choose identity file (.pn.json)'}
          </button>
          <input
            type="password"
            autoComplete="off"
            placeholder="pN name"
            value={pnName}
            onChange={(e) => setPnName(e.target.value)}
            className="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-white placeholder:text-neutral-500 focus:border-neutral-400 focus:outline-none"
            disabled={loading}
          />
          <input
            type="password"
            autoComplete="off"
            placeholder="Passcode"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            className="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-white placeholder:text-neutral-500 focus:border-neutral-400 focus:outline-none"
            disabled={loading}
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
                disabled={loading}
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-black hover:bg-amber-400 disabled:opacity-50"
            >
              {loading ? 'Loading…' : 'Load messaging keys'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
