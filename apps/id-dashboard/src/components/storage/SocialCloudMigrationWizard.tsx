import React, { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import type { StorageProviderId } from '@par-noir/user-owned-storage';
import { ownerFetch } from '../../services/ownerApiService';
import { resolveLocalGoogleAccessTokenAsync } from '../../services/deviceApiService';
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

type Preview = { sourceProvider: string; direction: string; notCarried: readonly string[] };
type ItemResult = { path: string; outcome: string; error?: string };

const DIRECTION_LABEL: Record<string, string> = {
  google_to_portable: 'Google Sheets → portable',
  portable_to_google: 'Portable → Google Sheets',
  portable_to_portable: 'Portable → portable',
};

async function okOrThrow(res: Response, fallback: string) {
  if (res.ok) return;
  const data = await res.json().catch(() => ({}));
  throw new Error(data.message || data.error || fallback);
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
  const [preview, setPreview] = useState<Preview | null>(null);
  const [artifactResults, setArtifactResults] = useState<ItemResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    void (async () => {
      const { getSessionCloudCredentials, socialMigrationDirection, SOCIAL_MIGRATION_NOT_CARRIED } =
        await import('@par-noir/device-cloud-credentials');
      const { resolveSocialCloudProvider } = await import('@par-noir/user-owned-storage');
      const credentials = getSessionCloudCredentials(pnIdentifier);
      if (!credentials) {
        setStep('error');
        setError('Unlock your cloud storage on this device first.');
        return;
      }
      const sourceProvider = resolveSocialCloudProvider(credentials);
      const direction = socialMigrationDirection(
        sourceProvider === 'google_drive' ? 'google_drive' : 'tables',
        targetProvider === 'google_drive' ? 'google_drive' : 'tables'
      );
      setPreview({
        sourceProvider,
        direction,
        notCarried: direction === 'portable_to_portable' ? [] : SOCIAL_MIGRATION_NOT_CARRIED
      });
    })();
  }, [pnIdentifier, targetProvider]);

  const runMigration = async () => {
    setLoading(true);
    setStep('running');
    setError(null);
    try {
      const {
        getSessionCloudCredentials,
        setSessionCloudCredentials,
        setSessionDriveIndex,
        openSocialCloudMove,
        migrateSocialCloudOnDevice
      } = await import('@par-noir/device-cloud-credentials');
      const credentials = getSessionCloudCredentials(pnIdentifier);
      if (!credentials) throw new Error('Unlock your cloud storage on this device first.');
      const googleAccessToken = (await resolveLocalGoogleAccessTokenAsync(pnIdentifier)) || undefined;
      const move = await openSocialCloudMove({
        pnIdentifier,
        credentials,
        targetProvider: targetProvider as StorageProviderId,
        targetAccountId,
        googleAccessToken
      });

      const results: ItemResult[] = [];
      await migrateSocialCloudOnDevice(move.source, move.target, {
        identityId: pnIdentifier,
        onItem: (item) => {
          results.push(item);
          setArtifactResults([...results]);
        }
      });
      const failed = results.filter((r) => r.outcome === 'failed');
      if (failed.length) {
        throw new Error(`Could not copy ${failed.map((r) => r.path).join(', ')}. Your social cloud was not changed.`);
      }

      await okOrThrow(
        await ownerFetch(
          authToken,
          'PUT',
          `/api/storage/credentials/${encodeURIComponent(pnIdentifier)}/social-cloud`,
          { provider: targetProvider, accountId: targetAccountId, migrated: true }
        ),
        'Social cloud update failed'
      );

      const switched = {
        ...credentials,
        socialCloudProvider: targetProvider as StorageProviderId,
        primaryProvider: targetProvider as StorageProviderId,
        socialCloudAccountId: targetAccountId
      };
      if ('pnDriveIndex' in move.targetLayout) {
        const { pnDriveIndex } = move.targetLayout;
        await okOrThrow(
          await ownerFetch(authToken, 'POST', `/api/storage/initialize/${encodeURIComponent(pnIdentifier)}`, {
            pnDriveIndex
          }),
          'Drive layout save failed'
        );
        setSessionCloudCredentials(pnIdentifier, switched);
        setSessionDriveIndex(pnIdentifier, pnDriveIndex);
      } else {
        const cachedLayout = { pathPrefix: move.targetLayout.pathPrefix };
        await okOrThrow(
          await ownerFetch(
            authToken,
            'POST',
            `/api/storage/layout/${encodeURIComponent(pnIdentifier)}`,
            { cachedLayout, portableLayoutInitialized: true },
            { pnIdentifier }
          ),
          'Storage layout save failed'
        );
        setSessionCloudCredentials(pnIdentifier, { ...switched, cachedLayout, cachedFolderIds: undefined });
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
                This device copies your tables, indexes, and conversations to{' '}
                <strong className="text-white">{targetLabel}</strong>. Encrypted files on other connected clouds
                stay where they are.
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
            Migrating…
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
            <li>Direction: {DIRECTION_LABEL[preview.direction] ?? preview.direction}</li>
            {preview.notCarried.length ? (
              <li className="text-amber-400">Not carried over: {preview.notCarried.join('; ')}</li>
            ) : null}
          </ul>
        )}

        {step === 'done' && (
          <p className="text-green-400 text-sm mb-4">Migration complete. Social cloud is now {targetProvider}.</p>
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
              disabled={loading || !preview}
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
