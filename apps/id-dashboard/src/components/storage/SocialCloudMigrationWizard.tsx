import React, { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { ownerFetch } from '../../services/ownerApiService';
import { SectionInfo } from '../common/SectionInfo';

interface StorageAccount {
  provider: string;
  accountId: string;
  displayName?: string;
}

interface SocialCloudMigrationWizardProps {
  pnIdentifier: string;
  authToken: string;
  accounts: StorageAccount[];
  targetProvider: string;
  targetAccountId: string;
  onClose: () => void;
  onComplete: () => void;
}

export function SocialCloudMigrationWizard({
  pnIdentifier,
  authToken,
  accounts,
  targetProvider,
  targetAccountId,
  onClose,
  onComplete
}: SocialCloudMigrationWizardProps) {
  const [step, setStep] = useState<'preview' | 'running' | 'done' | 'error'>('preview');
  const [preview, setPreview] = useState<{
    inventoryCount?: number;
    estimatedBytes?: number;
    blockers?: string[];
    sourceProvider?: string;
  } | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [artifactResults, setArtifactResults] = useState<
    Array<{ path: string; outcome: string; error?: string }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const res = await ownerFetch(
          authToken,
          'POST',
          '/api/storage/migrate/social-cloud/preview',
          { pnIdentifier, targetProvider, targetAccountId }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || data.error || 'Preview failed');
        setPreview(data);
        if (data.blockers?.length) {
          const hard = data.blockers.filter((b: string) => b.includes('same provider'));
          if (hard.length) {
            setStep('error');
            setError(hard.join('; '));
          }
        }
      } catch (e) {
        setStep('error');
        setError(e instanceof Error ? e.message : 'Preview failed');
      } finally {
        setLoading(false);
      }
    })();
  }, [authToken, pnIdentifier, targetProvider, targetAccountId]);

  const runMigration = async () => {
    setLoading(true);
    setStep('running');
    setError(null);
    try {
      const startRes = await ownerFetch(
        authToken,
        'POST',
        '/api/storage/migrate/social-cloud/start',
        { pnIdentifier, targetProvider, targetAccountId }
      );
      const startData = await startRes.json();
      if (!startRes.ok) throw new Error(startData.message || startData.error || 'Start failed');
      const id = startData.jobId as string;
      setJobId(id);

      let jobStatus = 'running';
      while (jobStatus === 'running') {
        const pollRes = await ownerFetch(
          authToken,
          'GET',
          `/api/storage/migrate/social-cloud/${id}`
        );
        const pollData = await pollRes.json();
        if (pollRes.ok) {
          jobStatus = pollData.status ?? 'running';
          const progress =
            pollData.progress_json ?? pollData.progress ?? {};
          const results = progress.results ?? progress.report?.items;
          if (Array.isArray(results)) {
            setArtifactResults(
              results.map((r: { path: string; outcome: string; error?: string }) => ({
                path: r.path,
                outcome: r.outcome,
                error: r.error
              }))
            );
          }
        }
        if (jobStatus === 'running') {
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }
      if (jobStatus === 'failed') {
        throw new Error('Migration job failed');
      }

      const completeRes = await ownerFetch(
        authToken,
        'POST',
        `/api/storage/migrate/social-cloud/${id}/complete`,
        { pnIdentifier, targetProvider, targetAccountId }
      );
      if (!completeRes.ok) {
        const errData = await completeRes.json();
        throw new Error(errData.message || errData.error || 'Complete failed');
      }

      const socialRes = await ownerFetch(
        authToken,
        'PUT',
        `/api/storage/credentials/${encodeURIComponent(pnIdentifier)}/social-cloud`,
        { provider: targetProvider, accountId: targetAccountId, migrationJobId: id }
      );
      if (!socialRes.ok) {
        const errData = await socialRes.json();
        throw new Error(errData.message || errData.error || 'Social cloud update failed');
      }

      setStep('done');
      onComplete();
    } catch (e) {
      setStep('error');
      setError(e instanceof Error ? e.message : 'Migration failed');
    } finally {
      setLoading(false);
    }
  };

  const targetLabel =
    accounts.find((a) => a.provider === targetProvider && a.accountId === targetAccountId)
      ?.displayName ?? targetProvider;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-6 max-w-md w-full">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-white">Social Cloud Migration</h3>
            <SectionInfo title="Social Cloud Migration">
              <p>
                Migrate tables, indexes, and JSON metadata to <strong className="text-white">{targetLabel}</strong>.
                Encrypted files on other connected clouds stay where they are.
              </p>
            </SectionInfo>
          </div>
          <button type="button" onClick={onClose} className="text-text-secondary hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading && step !== 'done' && (
          <div className="flex items-center gap-2 text-text-secondary text-sm mb-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            {step === 'running' ? 'Migrating…' : 'Loading preview…'}
          </div>
        )}

        {step === 'running' && artifactResults.length > 0 && (
          <ul className="text-xs text-text-secondary mb-4 max-h-32 overflow-y-auto space-y-0.5">
            {artifactResults.slice(-8).map((r) => (
              <li key={r.path}>
                {r.path}: {r.outcome}
                {r.error ? ` (${r.error})` : ''}
              </li>
            ))}
          </ul>
        )}

        {preview && step === 'preview' && (
          <ul className="text-sm text-text-secondary mb-4 space-y-1">
            <li>Source: {preview.sourceProvider}</li>
            <li>Target: {targetProvider}</li>
            <li>Direction: {preview.sourceProvider === 'google_drive' ? 'Google Sheets → portable' : targetProvider === 'google_drive' ? 'Portable → Google Sheets' : 'Portable → portable'}</li>
            <li>Items: ~{preview.inventoryCount ?? 0}</li>
            <li>Estimated size: {preview.estimatedBytes ?? 0} bytes</li>
            {preview.blockers?.length ? (
              <li className="text-amber-400">Notes: {preview.blockers.join('; ')}</li>
            ) : null}
          </ul>
        )}

        {step === 'done' && (
          <p className="text-green-400 text-sm mb-4">
            Migration complete. Social cloud is now {targetProvider}.
            {jobId ? ` Job: ${jobId.slice(0, 8)}…` : ''}
          </p>
        )}

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-neutral-600 text-sm text-text-secondary"
          >
            {step === 'done' ? 'Close' : 'Cancel'}
          </button>
          {step === 'preview' && !error && (
            <button
              type="button"
              disabled={loading}
              onClick={runMigration}
              className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm disabled:opacity-50"
            >
              Start migration
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
