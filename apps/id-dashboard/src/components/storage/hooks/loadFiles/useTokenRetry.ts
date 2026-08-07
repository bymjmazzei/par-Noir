/**
 * Backoff scheduling for owner-index / Drive loads that failed on an expired or
 * rate-limited Google token. Re-runs loadFiles via the shared ref.
 */
import React from 'react';

export interface UseTokenRetryParams {
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  loadFilesRef: React.MutableRefObject<((opts?: { verifyWithDrive?: boolean }) => Promise<void>) | null>;
  ownerIndexWarningLoggedRef: React.MutableRefObject<Set<string>>;
  ownerIndexRetryCountsRef: React.MutableRefObject<Map<string, number>>;
  rateLimitedBackendsRef: React.MutableRefObject<Set<string>>;
  pendingRetryTimeoutRef: React.MutableRefObject<number | null>;
}

export type ScheduleTokenRetry = (
  backendIds: string[],
  options?: { delayMs?: number; resetAttempts?: boolean }
) => void;

export function useTokenRetry({
  setError,
  loadFilesRef,
  ownerIndexWarningLoggedRef,
  ownerIndexRetryCountsRef,
  rateLimitedBackendsRef,
  pendingRetryTimeoutRef,
}: UseTokenRetryParams): ScheduleTokenRetry {
  const scheduleTokenRetry = React.useCallback<ScheduleTokenRetry>((backendIds, options) => {
    if (!backendIds.length) {
      return;
    }

    // Increment retry counts and determine delay (exponential backoff)
    const attempts: number[] = [];
    backendIds.forEach((backendId) => {
      if (options?.resetAttempts) {
        ownerIndexRetryCountsRef.current.set(backendId, 0);
      }
      const nextCount = (ownerIndexRetryCountsRef.current.get(backendId) || 0) + 1;
      ownerIndexRetryCountsRef.current.set(backendId, nextCount);
      attempts.push(nextCount);
    });

    const maxAttempts = Math.max(...attempts);
    const delay = options?.delayMs ?? Math.min(15000, 2000 * maxAttempts);

    if (maxAttempts >= 4 && !options?.delayMs) {
      console.warn('⚠️ [loadFiles] Giving up on owner index auto-refresh after repeated failures', {
        backendIds,
        attempts: attempts.reduce((acc, attempt, index) => {
          acc[backendIds[index]] = attempt;
          return acc;
        }, {} as Record<string, number>),
      });
      setError('Storage session expired. Please reconnect from the storage tab.');
      return;
    }

    if (pendingRetryTimeoutRef.current) {
      window.clearTimeout(pendingRetryTimeoutRef.current);
    }

    console.debug('⏳ [loadFiles] Scheduling token retry', {
      backendIds,
      attempts: attempts.reduce((acc, attempt, index) => {
        acc[backendIds[index]] = attempt;
        return acc;
      }, {} as Record<string, number>),
      delay,
    });

    pendingRetryTimeoutRef.current = window.setTimeout(() => {
      pendingRetryTimeoutRef.current = null;
      if (loadFilesRef.current) {
        loadFilesRef.current();
      }
    }, delay);
  }, []);

  React.useEffect(() => {
    return () => {
      ownerIndexWarningLoggedRef.current.clear();
      ownerIndexRetryCountsRef.current.clear();
      rateLimitedBackendsRef.current.clear();
      if (pendingRetryTimeoutRef.current) {
        window.clearTimeout(pendingRetryTimeoutRef.current);
        pendingRetryTimeoutRef.current = null;
      }
    };
  }, []);

  React.useEffect(() => {
    const handleRateLimited = (event: Event) => {
      const detail = (event as CustomEvent<{ backendId?: string; retryAfterMs?: number }>).detail;
      const backendId = detail?.backendId;
      const retryAfterMs = detail?.retryAfterMs ?? 60000;

      if (backendId) {
        rateLimitedBackendsRef.current.add(backendId);
        scheduleTokenRetry([backendId], { delayMs: retryAfterMs, resetAttempts: true });
      } else if (rateLimitedBackendsRef.current.size > 0) {
        scheduleTokenRetry(Array.from(rateLimitedBackendsRef.current), { delayMs: retryAfterMs, resetAttempts: true });
      }

      setError('Google Drive rate limited requests. Retrying shortly...');
    };

    window.addEventListener('google-drive-refresh-rate-limited', handleRateLimited as EventListener);
    return () => {
      window.removeEventListener('google-drive-refresh-rate-limited', handleRateLimited as EventListener);
    };
  }, [scheduleTokenRetry]);

  return scheduleTokenRetry;
}
