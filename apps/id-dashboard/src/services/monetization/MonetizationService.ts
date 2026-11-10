import { API_ENDPOINT } from '../../config/api';

export interface FundPeriodSummary {
  id: string;
  periodStart: string;
  periodEnd: string;
  /** IANA zone for window math when non-UTC; absent or null for legacy UTC windows. */
  periodTz?: string | null;
  status: string;
  closedAt: string | null;
  gCents: number;
  eCents: number;
  rCents: number;
  platform25Cents: number;
  fund75Cents: number;
  bountyVerifiedCents: number;
  chainHash: string | null;
  periodAttestationHmac?: string | null;
}

export interface MonetizationStatusResponse {
  verified: boolean;
  maintenanceActive: boolean;
  currentPeriodEnd: string | null;
  renewalPriceCents: number | null;
  eligibleForFundAccrual: boolean;
  stripeConfigured: boolean;
  veriffConfigured: boolean;
  stripeCustomerId: string | null;
  connectOnboarded: boolean;
  payoutCadenceNote: string;
  recentClosedPeriods: FundPeriodSummary[];
  creatorFundPayoutAvailableCents?: number;
  creatorFundPayoutInHoldCents?: number;
  creatorFundPaidOutCents?: number;
}

export interface VeriffSessionResponse {
  url: string;
  sessionId: string;
  /** API-signed (session, pN) binding; the only link between this pN and the Veriff session. */
  state: string;
}

export interface VeriffDecisionResponse {
  /** pending | approved | declined | resubmission_requested | expired | abandoned | review */
  status: string;
  sessionId: string;
  /** API-signed verification credential (approved only); store it in the pN's own Knowledge docs. */
  credential?: string;
  expiresAt?: string;
  person?: { firstName: string | null; lastName: string | null; dateOfBirth: string | null };
  document?: {
    number: string | null;
    type: string | null;
    country: string | null;
    state: string | null;
    validUntil: string | null;
  };
}

function authHeaders(accessToken: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`
  };
}

export class MonetizationService {
  static async getStatus(accessToken: string): Promise<MonetizationStatusResponse> {
    const res = await fetch(`${API_ENDPOINT}/api/monetization/status`, {
      headers: authHeaders(accessToken)
    });
    const data = (await res.json().catch(() => ({}))) as { error_description?: string };
    if (!res.ok) {
      throw new Error(data.error_description || `Status failed (${res.status})`);
    }
    return data as MonetizationStatusResponse;
  }

  static async createCheckoutSession(accessToken: string, returnBaseUrl: string): Promise<string> {
    const res = await fetch(`${API_ENDPOINT}/api/monetization/create-checkout-session`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({ return_base_url: returnBaseUrl })
    });
    const data = (await res.json().catch(() => ({}))) as { url?: string; error_description?: string };
    if (!res.ok) {
      throw new Error(data.error_description || `Checkout failed (${res.status})`);
    }
    if (!data.url) throw new Error('No checkout URL returned');
    return data.url;
  }

  static async createPortalSession(accessToken: string, returnBaseUrl: string): Promise<string> {
    const res = await fetch(`${API_ENDPOINT}/api/monetization/create-portal-session`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({ return_base_url: returnBaseUrl })
    });
    const data = (await res.json().catch(() => ({}))) as { url?: string; error_description?: string };
    if (!res.ok) {
      throw new Error(data.error_description || `Portal failed (${res.status})`);
    }
    if (!data.url) throw new Error('No portal URL returned');
    return data.url;
  }

  static async renewFromBalance(
    accessToken: string,
    returnBaseUrl?: string
  ): Promise<{
    renewed: boolean;
    balanceAfter: number;
    needsPayment: boolean;
    shortfallCents?: number;
    checkoutUrl?: string;
  }> {
    const res = await fetch(`${API_ENDPOINT}/api/monetization/renew-from-balance`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify(returnBaseUrl ? { return_url: returnBaseUrl } : {})
    });
    const data = (await res.json().catch(() => ({}))) as {
      renewed?: boolean;
      balanceAfter?: number;
      needsPayment?: boolean;
      shortfallCents?: number;
      checkoutUrl?: string;
      error_description?: string;
    };
    if (!res.ok) {
      throw new Error(data.error_description || `Renew failed (${res.status})`);
    }
    return {
      renewed: Boolean(data.renewed),
      balanceAfter: Number(data.balanceAfter ?? 0),
      needsPayment: Boolean(data.needsPayment),
      shortfallCents: data.shortfallCents,
      checkoutUrl: data.checkoutUrl
    };
  }

  static async createConnectAccountLink(
    accessToken: string,
    returnBaseUrl: string
  ): Promise<{ url: string; alreadyOnboarded: boolean }> {
    const res = await fetch(`${API_ENDPOINT}/api/monetization/create-connect-account-link`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({ return_base_url: returnBaseUrl })
    });
    const data = (await res.json().catch(() => ({}))) as {
      url?: string;
      alreadyOnboarded?: boolean;
      error_description?: string;
    };
    if (!res.ok) {
      throw new Error(data.error_description || `Connect link failed (${res.status})`);
    }
    if (data.alreadyOnboarded) {
      return { url: '', alreadyOnboarded: true };
    }
    return { url: data.url || '', alreadyOnboarded: false };
  }

  static async requestCreatorFundPayout(
    accessToken: string,
    amountCents: number
  ): Promise<{ payoutRequestId: string; amountCents: number; status: string }> {
    const res = await fetch(`${API_ENDPOINT}/api/monetization/request-payout`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({ amount_cents: amountCents })
    });
    const data = (await res.json().catch(() => ({}))) as {
      payoutRequestId?: string;
      amountCents?: number;
      status?: string;
      error_description?: string;
    };
    if (!res.ok) {
      throw new Error(data.error_description || `Payout failed (${res.status})`);
    }
    return {
      payoutRequestId: String(data.payoutRequestId ?? ''),
      amountCents: Number(data.amountCents ?? amountCents),
      status: String(data.status ?? 'queued')
    };
  }

  /** Veriff hosted flow for the token's pN (membership required). Keep `state` to finalize. */
  static async createVeriffSession(accessToken: string, returnUrl: string): Promise<VeriffSessionResponse> {
    const res = await fetch(`${API_ENDPOINT}/api/verification/veriff/session`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({ return_url: returnUrl })
    });
    const data = (await res.json().catch(() => ({}))) as Partial<VeriffSessionResponse> & {
      error_description?: string;
    };
    if (!res.ok) {
      throw new Error(data.error_description || `Veriff session failed (${res.status})`);
    }
    if (!data.url || !data.state || !data.sessionId) throw new Error('Veriff session response incomplete');
    return { url: data.url, sessionId: data.sessionId, state: data.state };
  }

  static async getVeriffDecision(accessToken: string, state: string): Promise<VeriffDecisionResponse> {
    const res = await fetch(`${API_ENDPOINT}/api/verification/veriff/decision`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({ state })
    });
    const data = (await res.json().catch(() => ({}))) as VeriffDecisionResponse & {
      error?: string;
      error_description?: string;
    };
    if (!res.ok) {
      throw Object.assign(new Error(data.error_description || `Veriff decision failed (${res.status})`), {
        code: data.error
      });
    }
    return data;
  }

  /** Restore this pN's server-side verified flag from the credential it holds. */
  static async presentVerificationCredential(
    accessToken: string,
    credential: string
  ): Promise<{ verified: true; expiresAt: string }> {
    return credentialCall(accessToken, '/api/verification/credential/present', credential);
  }

  /** Exchange a predecessor pN's credential for one issued to this (successor) pN. */
  static async reissueVerificationCredential(
    accessToken: string,
    credential: string
  ): Promise<{ credential: string; expiresAt: string }> {
    return credentialCall(accessToken, '/api/verification/credential/reissue', credential);
  }
}

async function credentialCall<T>(accessToken: string, path: string, credential: string): Promise<T> {
  const res = await fetch(`${API_ENDPOINT}${path}`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ credential })
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw Object.assign(new Error(data.error || `Verification credential request failed (${res.status})`), {
      code: data.error
    });
  }
  return data;
}
