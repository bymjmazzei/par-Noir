/**
 * Browser CTA when owner cloud layout is behind — upgrade runs only on the dashboard.
 */

import React, { useEffect, useState } from 'react';
import { API_ENDPOINT } from '../config/api';
import { dashboardStorageUrl } from '../config/dashboard';
import { PNOAuthService } from '../services/pnOAuthService';

type LayoutStatus = {
  complete?: boolean;
  pending?: Array<{ id: string; description: string }>;
};

export const CloudLayoutUpdateBanner: React.FC = () => {
  const session = PNOAuthService.loadSession();
  const authToken = session?.accessToken ?? null;
  const pnIdentifier = session?.pnIdentifier ?? null;
  const [behind, setBehind] = useState(false);
  const [description, setDescription] = useState<string | null>(null);

  useEffect(() => {
    if (!authToken || !pnIdentifier) {
      setBehind(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `${API_ENDPOINT.replace(/\/$/, '')}/api/storage/${encodeURIComponent(pnIdentifier)}/layout/status`,
          { headers: { Authorization: `Bearer ${authToken}` } }
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as LayoutStatus;
        if (cancelled) return;
        setBehind(data.complete === false);
        const first = data.pending?.[0]?.description;
        setDescription(first ?? null);
      } catch {
        if (!cancelled) setBehind(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authToken, pnIdentifier]);

  if (!behind) return null;

  return (
    <div
      className="mx-4 mt-3 rounded-lg border border-amber-600/50 bg-amber-950/50 px-3 py-2 text-sm text-amber-100"
      role="status"
    >
      <p className="font-medium">Cloud layout update required</p>
      <p className="mt-1 text-amber-200/90 text-xs">
        {description
          ? `${description}. `
          : 'Your secure cloud needs an update. '}
        Open the dashboard Storage section and choose Complete update.
      </p>
      <a
        href={dashboardStorageUrl()}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block mt-2 text-amber-50 underline underline-offset-2 hover:text-white text-xs"
      >
        Open dashboard Storage
      </a>
    </div>
  );
};

/** True when layout status says incomplete (for soft-blocking messaging). */
export async function isCloudLayoutBehind(authToken: string, pnIdentifier: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${API_ENDPOINT.replace(/\/$/, '')}/api/storage/${encodeURIComponent(pnIdentifier)}/layout/status`,
      { headers: { Authorization: `Bearer ${authToken}` } }
    );
    if (res.status === 404) return true;
    if (!res.ok) return false;
    const data = (await res.json()) as LayoutStatus;
    return data.complete === false;
  } catch {
    return false;
  }
}
