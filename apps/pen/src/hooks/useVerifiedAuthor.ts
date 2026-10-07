import { useEffect, useState } from 'react';
import { resolveVerifiedAuthor, isClientVerifiedAuthor } from '../services/penAuthorVerification';
import type { PenSession } from '../services/penSession';

export function useVerifiedAuthor(session: PenSession | null | undefined): boolean {
  const [verified, setVerified] = useState(() =>
    session?.pnIdentifier ? isClientVerifiedAuthor(session.pnIdentifier) : false
  );

  useEffect(() => {
    if (!session?.accessToken || !session.pnIdentifier) {
      setVerified(false);
      return;
    }
    let cancelled = false;
    void resolveVerifiedAuthor(session).then((v) => {
      if (!cancelled) setVerified(v);
    });
    return () => {
      cancelled = true;
    };
  }, [session?.accessToken, session?.pnIdentifier]);

  return verified;
}
