import { useCallback, useState } from 'react';
import { fetchReputation, submitRayApply } from '../services/prismApi';

export function useRayApply(accessToken: string | undefined) {
  const [applyStatus, setApplyStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [applyError, setApplyError] = useState<string | null>(null);

  const submitApply = useCallback(async (): Promise<boolean> => {
    if (!accessToken) {
      setApplyError('Sign in required');
      setApplyStatus('error');
      return false;
    }
    setApplyStatus('loading');
    setApplyError(null);
    try {
      const reputation = await fetchReputation(accessToken);
      if (!reputation.eligible) {
        setApplyError('Reputation score too low to apply as a Ray');
        setApplyStatus('error');
        return false;
      }
      await submitRayApply(accessToken);
      setApplyStatus('success');
      return true;
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : 'Apply failed');
      setApplyStatus('error');
      return false;
    }
  }, [accessToken]);

  return { applyStatus, applyError, submitApply, setApplyStatus, setApplyError };
}
