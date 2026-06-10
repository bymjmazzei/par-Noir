import { Navigate, Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { fetchPlatformAccess } from '../../services/platformApi';
import { usePortal } from '../../context/PortalContext';

/** Gates /platform/* routes to allowlisted operator pNs only. */
export function PlatformOperatorGate() {
  const { signedIn, loadingSession } = usePortal();
  const [isOperator, setIsOperator] = useState<boolean | null>(null);

  useEffect(() => {
    if (!signedIn) {
      setIsOperator(false);
      return;
    }
    void fetchPlatformAccess().then(({ isOperator: op }) => setIsOperator(op));
  }, [signedIn]);

  if (loadingSession || (signedIn && isOperator === null)) {
    return (
      <main className="dev-main">
        <p className="dev-muted">Checking operator access…</p>
      </main>
    );
  }

  if (!signedIn || !isOperator) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
