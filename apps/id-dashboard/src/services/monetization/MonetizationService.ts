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
  bountyUnverifiedCents: number;
  chainHash: string | null;
  periodAttestationHmac?: string | null;
}

export interface MonetizationStatusResponse {
  verified: boolean;
  maintenanceActive: boolean;
  currentPeriodEnd: string | null;
  balanceCents: number;
  renewalPriceCents: number | null;
  eligibleForFundAccrual: boolean;
  stripeConfigured: boolean;
  stripeCustomerId: string | null;
  connectOnboarded: boolean;
  payoutCadenceNote: string;
  recentClosedPeriods: FundPeriodSummary[];
  creatorFundPayoutAvailableCents?: number;
  creatorFundPayoutInHoldCents?: number;
  creatorFundPaidOutCents?: number;
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

  static async renewFromBalance(accessToken: string): Promise<{
    renewed: boolean;
    balanceAfter: number;
    needsPayment: boolean;
    shortfallCents?: number;
  }> {
    const res = await fetch(`${API_ENDPOINT}/api/monetization/renew-from-balance`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({})
    });
    const data = (await res.json().catch(() => ({}))) as {
      renewed?: boolean;
      balanceAfter?: number;
      needsPayment?: boolean;
      shortfallCents?: number;
      error_description?: string;
    };
    if (!res.ok) {
      throw new Error(data.error_description || `Renew failed (${res.status})`);
    }
    return {
      renewed: Boolean(data.renewed),
      balanceAfter: Number(data.balanceAfter ?? 0),
      needsPayment: Boolean(data.needsPayment),
      shortfallCents: data.shortfallCents
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
  ): Promise<{ transferId: string; amountCents: number }> {
    const res = await fetch(`${API_ENDPOINT}/api/monetization/request-payout`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({ amount_cents: amountCents })
    });
    const data = (await res.json().catch(() => ({}))) as {
      transferId?: string;
      amountCents?: number;
      error_description?: string;
    };
    if (!res.ok) {
      throw new Error(data.error_description || `Payout failed (${res.status})`);
    }
    return {
      transferId: String(data.transferId ?? ''),
      amountCents: Number(data.amountCents ?? amountCents)
    };
  }
}
