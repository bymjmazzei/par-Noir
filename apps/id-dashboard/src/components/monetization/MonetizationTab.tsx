import React, { useCallback, useEffect, useState } from 'react';
import { MonetizationService, type MonetizationStatusResponse } from '../../services/monetization/MonetizationService';

export interface MonetizationTabProps {
  accessToken: string;
  showErrorMessage: (message: string) => void;
  showSuccessMessage: (message: string) => void;
}

const MIN_PAYOUT_CENTS = 1000;

export function MonetizationTab({ accessToken, showErrorMessage, showSuccessMessage }: MonetizationTabProps) {
  const [status, setStatus] = useState<MonetizationStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [payoutAmountUsd, setPayoutAmountUsd] = useState('10');

  const returnBase = typeof window !== 'undefined' ? window.location.origin : 'https://pn.parnoir.com';

  const load = useCallback(async () => {
    if (!accessToken) {
      setStatus(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const s = await MonetizationService.getStatus(accessToken);
      setStatus(s);
    } catch (e) {
      setStatus(null);
      showErrorMessage(e instanceof Error ? e.message : 'Could not load monetization status');
    } finally {
      setLoading(false);
    }
  }, [accessToken, showErrorMessage]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSubscribe = async () => {
    if (!accessToken) return;
    setBusy(true);
    try {
      const url = await MonetizationService.createCheckoutSession(accessToken, returnBase);
      window.location.href = url;
    } catch (e) {
      showErrorMessage(e instanceof Error ? e.message : 'Checkout failed');
    } finally {
      setBusy(false);
    }
  };

  const onManageBilling = async () => {
    if (!accessToken) return;
    setBusy(true);
    try {
      const url = await MonetizationService.createPortalSession(accessToken, returnBase);
      window.location.href = url;
    } catch (e) {
      showErrorMessage(e instanceof Error ? e.message : 'Billing portal failed');
    } finally {
      setBusy(false);
    }
  };

  const onRenewBalance = async () => {
    if (!accessToken) return;
    setBusy(true);
    try {
      const r = await MonetizationService.renewFromBalance(accessToken);
      if (r.renewed) {
        showSuccessMessage('Maintenance renewed from your creator-fund balance.');
        await load();
      } else if (r.needsPayment) {
        showErrorMessage(
          `Insufficient balance for renewal${r.shortfallCents != null ? ` (shortfall ${(r.shortfallCents / 100).toFixed(2)} USD)` : ''}. Use Subscribe with card.`
        );
      }
    } catch (e) {
      showErrorMessage(e instanceof Error ? e.message : 'Balance renewal failed');
    } finally {
      setBusy(false);
    }
  };

  const onConnect = async () => {
    if (!accessToken) return;
    setBusy(true);
    try {
      const r = await MonetizationService.createConnectAccountLink(accessToken, returnBase);
      if (r.alreadyOnboarded) {
        showSuccessMessage('Stripe Connect is already enabled for payouts.');
        await load();
      } else if (r.url) {
        window.location.href = r.url;
      }
    } catch (e) {
      showErrorMessage(e instanceof Error ? e.message : 'Connect onboarding failed');
    } finally {
      setBusy(false);
    }
  };

  const onRequestPayout = async () => {
    if (!accessToken) return;
    const parsed = parseFloat(payoutAmountUsd);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      showErrorMessage('Enter a valid payout amount in USD.');
      return;
    }
    const amountCents = Math.round(parsed * 100);
    if (amountCents < MIN_PAYOUT_CENTS) {
      showErrorMessage('Minimum payout is 10.00 USD.');
      return;
    }
    setBusy(true);
    try {
      const out = await MonetizationService.requestCreatorFundPayout(accessToken, amountCents);
      showSuccessMessage(`Transfer initiated (${(out.amountCents / 100).toFixed(2)} USD).`);
      await load();
    } catch (e) {
      showErrorMessage(e instanceof Error ? e.message : 'Payout request failed');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 text-text-primary">
      <div>
        <h3 className="text-lg font-semibold mb-2">Creator fund · Monetization</h3>
        <p className="text-sm text-text-secondary leading-relaxed">
          Verified identity plus active <strong>monetization maintenance</strong> unlock creator-fund participation.
          Payouts use <strong>Stripe Connect</strong> (US-only v1). This tab talks only to the par Noir API — no card
          data in the dashboard.
        </p>
      </div>

      {!accessToken ? (
        <p className="text-sm text-amber-600">Unlock your identity to view monetization status.</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-secondary p-4">
              <div className="text-xs text-text-secondary uppercase tracking-wide">Verification</div>
              <div className="mt-1 font-medium">{status?.verified ? 'Verified' : 'Not verified'}</div>
            </div>
            <div className="rounded-lg border border-border bg-secondary p-4">
              <div className="text-xs text-text-secondary uppercase tracking-wide">Maintenance</div>
              <div className="mt-1 font-medium">{status?.maintenanceActive ? 'Active' : 'Inactive'}</div>
              {status?.currentPeriodEnd && (
                <div className="text-xs text-text-secondary mt-1">
                  Current period ends {new Date(status.currentPeriodEnd).toLocaleString()}
                </div>
              )}
            </div>
            <div className="rounded-lg border border-border bg-secondary p-4">
              <div className="text-xs text-text-secondary uppercase tracking-wide">Fund balance (ledger)</div>
              <div className="mt-1 font-medium">
                {status != null ? `${(status.balanceCents / 100).toFixed(2)} USD` : '—'}
              </div>
              {status?.renewalPriceCents != null && status.renewalPriceCents > 0 && (
                <div className="text-xs text-text-secondary mt-1">
                  Renewal reference: {(status.renewalPriceCents / 100).toFixed(2)} USD / period
                </div>
              )}
            </div>
            <div className="rounded-lg border border-border bg-secondary p-4">
              <div className="text-xs text-text-secondary uppercase tracking-wide">Eligible for fund accrual</div>
              <div className="mt-1 font-medium">{status?.eligibleForFundAccrual ? 'Yes' : 'No'}</div>
            </div>
            <div className="rounded-lg border border-border bg-secondary p-4 sm:col-span-2">
              <div className="text-xs text-text-secondary uppercase tracking-wide">Creator bounty (after policy hold)</div>
              <div className="mt-1 grid gap-2 sm:grid-cols-3 text-sm">
                <div>
                  <span className="text-text-secondary">Available to pay out</span>
                  <div className="font-medium text-text-primary">
                    {status != null
                      ? `${((status.creatorFundPayoutAvailableCents ?? 0) / 100).toFixed(2)} USD`
                      : '—'}
                  </div>
                </div>
                <div>
                  <span className="text-text-secondary">Still in hold</span>
                  <div className="font-medium text-text-primary">
                    {status != null
                      ? `${((status.creatorFundPayoutInHoldCents ?? 0) / 100).toFixed(2)} USD`
                      : '—'}
                  </div>
                </div>
                <div>
                  <span className="text-text-secondary">Paid out (transfers)</span>
                  <div className="font-medium text-text-primary">
                    {status != null
                      ? `${((status.creatorFundPaidOutCents ?? 0) / 100).toFixed(2)} USD`
                      : '—'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {!status?.stripeConfigured && (
            <div className="rounded-lg border border-amber-600/40 bg-amber-950/20 p-4 text-sm text-amber-100">
              Monetization billing is not configured on this API deployment (Stripe keys / price id). Status reflects
              verification and ledger only.
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            {status?.stripeConfigured && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onSubscribe()}
                  className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {status.maintenanceActive ? 'Update payment (Checkout)' : 'Subscribe (Stripe Checkout)'}
                </button>
                {status.stripeCustomerId && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onManageBilling()}
                    className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-border/40 disabled:opacity-50"
                  >
                    Billing portal
                  </button>
                )}
              </>
            )}
            {status?.stripeConfigured && status.renewalPriceCents != null && status.renewalPriceCents > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onRenewBalance()}
                className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-border/40 disabled:opacity-50"
              >
                Try balance-first renewal
              </button>
            )}
            {status?.stripeConfigured && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onConnect()}
                className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-border/40 disabled:opacity-50"
              >
                {status.connectOnboarded ? 'Refresh Connect status' : 'Stripe Connect onboarding'}
              </button>
            )}
            {status?.stripeConfigured && status.connectOnboarded && (status.creatorFundPayoutAvailableCents ?? 0) >= MIN_PAYOUT_CENTS && (
              <div className="flex flex-wrap items-end gap-2 w-full sm:w-auto">
                <label className="flex flex-col text-xs text-text-secondary">
                  Payout (USD)
                  <input
                    type="number"
                    min={MIN_PAYOUT_CENTS / 100}
                    step="0.01"
                    value={payoutAmountUsd}
                    onChange={(ev) => setPayoutAmountUsd(ev.target.value)}
                    className="mt-1 w-32 rounded border border-border bg-secondary px-2 py-1 text-sm text-text-primary"
                  />
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onRequestPayout()}
                  className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  Request bounty payout
                </button>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border bg-modal-bg p-4 text-sm text-text-secondary space-y-2">
            <p>
              <strong className="text-text-primary">Payouts:</strong> {status?.payoutCadenceNote}
            </p>
            <p>
              Maintenance renewals may settle from your <strong>creator-fund balance</strong> first when sufficient;
              otherwise use card checkout. Accounting follows the creator fund economics doc.
            </p>
            <p className="text-xs text-text-secondary pt-2 border-t border-border">
              <strong className="text-text-primary">Fund periods (no Stripe):</strong> Platform operators close rolling
              windows via <code className="text-text-primary">POST /api/creator-fund/periods/close</code> using{' '}
              <code className="text-text-primary">X-Cron-Secret</code> or the admin API key. OPEX lines:{' '}
              <code className="text-text-primary">POST /api/creator-fund/opex</code> (admin). <strong>G</strong> sums{' '}
              <code>creator_fund_revenue_events</code> in the window (including balance-first ledger rows). Windows use{' '}
              <code className="text-text-primary">CREATOR_FUND_PERIOD_TZ</code> (default America/New_York; set{' '}
              <code className="text-text-primary">UTC</code> for legacy contiguous UTC slices). Allocations export:{' '}
              <code className="text-text-primary">GET /api/creator-fund/periods/:id/allocations</code> (cron or admin).
            </p>
          </div>

          {(status?.recentClosedPeriods ?? []).length > 0 && (
            <div>
              <h4 className="font-medium text-text-primary mb-2">Recent closed fund periods</h4>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-text-secondary">
                      <th className="p-2">End</th>
                      <th className="p-2">G</th>
                      <th className="p-2">E</th>
                      <th className="p-2">R</th>
                      <th className="p-2">25%</th>
                      <th className="p-2">75% fund</th>
                      <th className="p-2">90% / 10%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(status?.recentClosedPeriods ?? []).map((p) => (
                      <tr key={p.id} className="border-b border-border/60 last:border-0">
                        <td className="p-2 text-text-primary whitespace-nowrap">
                          <span>{new Date(p.periodEnd).toLocaleDateString()}</span>
                          {p.periodTz ? (
                            <span className="block text-text-secondary text-[10px]">{p.periodTz}</span>
                          ) : (
                            <span className="block text-text-secondary text-[10px]">UTC window</span>
                          )}
                        </td>
                        <td className="p-2">${(p.gCents / 100).toFixed(2)}</td>
                        <td className="p-2">${(p.eCents / 100).toFixed(2)}</td>
                        <td className="p-2">${(p.rCents / 100).toFixed(2)}</td>
                        <td className="p-2">${(p.platform25Cents / 100).toFixed(2)}</td>
                        <td className="p-2">${(p.fund75Cents / 100).toFixed(2)}</td>
                        <td className="p-2 text-text-secondary">
                          ${(p.bountyVerifiedCents / 100).toFixed(2)} / ${(p.bountyUnverifiedCents / 100).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
