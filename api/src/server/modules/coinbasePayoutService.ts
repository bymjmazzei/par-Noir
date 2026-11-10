/**
 * Creator-fund crypto payouts: USDC on Base sent from the platform's Coinbase account through the
 * Coinbase App API v2 send endpoint, authenticated with a CDP API key (ES256 JWT per request).
 * Coinbase Commerce (`coinbaseWebhookHandler`) is a separate, incoming-payment integration.
 *
 * Self-custody wallets carry no identity check of their own, so a crypto payout requires a
 * verified pN (Stripe Identity) and every destination is screened against a sanctioned-address
 * list (`CRYPTO_PAYOUT_SANCTIONS_LIST_PATH`, one address per line) at save, request, and send time.
 * Without the list the rail is off.
 */

import crypto from 'crypto';
import fs from 'fs';
import jwt, { type JwtHeader } from 'jsonwebtoken';
import type { Pool } from 'pg';
import { getDatabasePool } from '../utils/database';

type DbQueryable = Pick<Pool, 'query'>;

export const CRYPTO_PAYOUT_NETWORK = 'base' as const;
export const CRYPTO_PAYOUT_CURRENCY = 'USDC' as const;
const API_HOST = 'api.coinbase.com';
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
/** Coinbase transaction states that mean the send will not settle. */
const FAILED_SEND_STATUSES = new Set(['failed', 'expired', 'canceled']);

export interface CoinbasePayoutConfig {
  keyName: string;
  keySecret: string;
  accountId: string;
  sanctionsListPath: string;
}

export function coinbasePayoutConfig(): CoinbasePayoutConfig | null {
  const keyName = process.env.COINBASE_PAYOUT_API_KEY_NAME?.trim();
  const keySecret = process.env.COINBASE_PAYOUT_API_KEY_SECRET?.trim();
  const accountId = process.env.COINBASE_PAYOUT_ACCOUNT_ID?.trim();
  const sanctionsListPath = process.env.CRYPTO_PAYOUT_SANCTIONS_LIST_PATH?.trim();
  if (!keyName || !keySecret || !accountId || !sanctionsListPath) return null;
  return { keyName, keySecret: keySecret.replace(/\\n/g, '\n'), accountId, sanctionsListPath };
}

/** Lowercased EVM address, or null when it is not one. */
export function normalizeEvmAddress(raw: unknown): string | null {
  const s = typeof raw === 'string' ? raw.trim() : '';
  return EVM_ADDRESS.test(s) ? s.toLowerCase() : null;
}

let sanctionsCache: { path: string; mtimeMs: number; addresses: Set<string> } | null = null;

function sanctionedAddresses(path: string): Set<string> {
  let mtimeMs: number;
  try {
    mtimeMs = fs.statSync(path).mtimeMs;
  } catch {
    throw new Error('sanctions_list_unavailable');
  }
  if (sanctionsCache?.path === path && sanctionsCache.mtimeMs === mtimeMs) return sanctionsCache.addresses;
  const addresses = new Set(
    fs
      .readFileSync(path, 'utf-8')
      .split(/\r?\n/)
      .map((l) => l.replace(/#.*/, '').trim().toLowerCase())
      .filter(Boolean)
  );
  sanctionsCache = { path, mtimeMs, addresses };
  return addresses;
}

/** Throws `sanctions_list_unavailable` when the list cannot be read (the rail fails closed). */
export function isSanctionedAddress(address: string): boolean {
  const path = process.env.CRYPTO_PAYOUT_SANCTIONS_LIST_PATH?.trim();
  if (!path) throw new Error('sanctions_list_unavailable');
  return sanctionedAddresses(path).has(address.trim().toLowerCase());
}

export class CoinbaseSendError extends Error {
  constructor(
    message: string,
    /** Coinbase refused the request itself; retrying the same request cannot succeed. */
    readonly definitive: boolean
  ) {
    super(message);
  }
}

function bearerToken(cfg: CoinbasePayoutConfig, method: string, path: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: cfg.keyName, nonce: crypto.randomBytes(16).toString('hex') };
  return jwt.sign(
    { sub: cfg.keyName, iss: 'cdp', nbf: now, exp: now + 120, uri: `${method} ${API_HOST}${path}` },
    cfg.keySecret,
    { algorithm: 'ES256', header: header as unknown as JwtHeader }
  );
}

export interface CryptoDestination {
  network: string;
  address: string;
}

export interface QueuedCryptoPayoutRow {
  id: string;
  amount_cents: number | string;
  crypto_network?: string | null;
  crypto_destination_address?: string | null;
}

export class CoinbasePayoutService {
  static async getDestination(pnIdentifier: string, db: DbQueryable = getDatabasePool()): Promise<CryptoDestination | null> {
    try {
      const r = await db.query(
        `SELECT network, address FROM creator_fund_crypto_destinations WHERE pn_identifier = $1`,
        [pnIdentifier.trim()]
      );
      const row = r.rows[0] as CryptoDestination | undefined;
      return row ? { network: row.network, address: row.address } : null;
    } catch {
      return null;
    }
  }

  static async setDestination(pnIdentifier: string, rawAddress: unknown): Promise<CryptoDestination> {
    if (!coinbasePayoutConfig()) throw new Error('crypto_payouts_not_configured');
    const address = normalizeEvmAddress(rawAddress);
    if (!address) throw new Error('crypto_address_invalid');
    if (isSanctionedAddress(address)) throw new Error('crypto_destination_blocked');
    await getDatabasePool().query(
      `INSERT INTO creator_fund_crypto_destinations (pn_identifier, network, address, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (pn_identifier) DO UPDATE SET network = EXCLUDED.network, address = EXCLUDED.address, updated_at = NOW()`,
      [pnIdentifier.trim(), CRYPTO_PAYOUT_NETWORK, address]
    );
    return { network: CRYPTO_PAYOUT_NETWORK, address };
  }

  /**
   * Send USDC. `idem` (the payout row UUID) makes Coinbase return the existing transaction on a
   * retry instead of sending twice.
   */
  static async sendUsdc(input: {
    idem: string;
    address: string;
    amountCents: number;
    description: string;
  }): Promise<{ transactionId: string; status: string }> {
    const cfg = coinbasePayoutConfig();
    if (!cfg) throw new CoinbaseSendError('crypto_payouts_not_configured', false);
    const path = `/v2/accounts/${encodeURIComponent(cfg.accountId)}/transactions`;
    let res: Response;
    try {
      res = await fetch(`https://${API_HOST}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bearerToken(cfg, 'POST', path)}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'send',
          to: input.address,
          amount: (input.amountCents / 100).toFixed(2),
          currency: CRYPTO_PAYOUT_CURRENCY,
          network: CRYPTO_PAYOUT_NETWORK,
          idem: input.idem,
          description: input.description
        })
      });
    } catch (e) {
      throw new CoinbaseSendError(e instanceof Error ? e.message : 'coinbase_network_error', false);
    }
    const body = (await res.json().catch(() => ({}))) as {
      data?: { id?: string; status?: string };
      errors?: Array<{ id?: string; message?: string }>;
    };
    if (!res.ok) {
      const definitive = res.status >= 400 && res.status < 500 && res.status !== 429;
      throw new CoinbaseSendError(body.errors?.[0]?.id || `coinbase_http_${res.status}`, definitive);
    }
    if (!body.data?.id) throw new CoinbaseSendError('coinbase_response_incomplete', false);
    return { transactionId: body.data.id, status: String(body.data.status || 'pending').toLowerCase() };
  }

  /**
   * Cron: send one queued crypto payout row. The row is committed as `processing` before the send;
   * a network error leaves it there for a retry under the same `idem`. A definitive refusal, a
   * failed transaction, or a sanctioned destination marks it `failed` (balance returns to available).
   * `error` is set when the row was not paid this run; neither is set when another run claimed it.
   */
  static async payQueuedRow(
    row: QueuedCryptoPayoutRow,
    db: DbQueryable = getDatabasePool()
  ): Promise<{ paid: boolean; error?: string }> {
    const outcome = await this.payQueuedRowInner(row, db);
    return outcome === 'paid' ? { paid: true } : outcome === 'skipped' ? { paid: false } : { paid: false, error: outcome };
  }

  private static async payQueuedRowInner(row: QueuedCryptoPayoutRow, db: DbQueryable): Promise<string> {
    const id = String(row.id);
    const markFailed = () =>
      db.query(
        `UPDATE creator_fund_payout_requests SET status = 'failed', updated_at = NOW()
         WHERE id = $1::uuid AND status IN ('queued', 'processing')`,
        [id]
      );
    if (!coinbasePayoutConfig()) return 'crypto_payouts_not_configured';
    const address = normalizeEvmAddress(row.crypto_destination_address);
    if (!address || row.crypto_network !== CRYPTO_PAYOUT_NETWORK) {
      await markFailed();
      return 'crypto_destination_invalid';
    }
    let blocked: boolean;
    try {
      blocked = isSanctionedAddress(address);
    } catch {
      return 'sanctions_list_unavailable';
    }
    if (blocked) {
      await markFailed();
      return 'crypto_destination_blocked';
    }

    const claimed = await db.query(
      `UPDATE creator_fund_payout_requests SET status = 'processing', updated_at = NOW()
       WHERE id = $1::uuid AND status IN ('queued', 'processing')
       RETURNING id`,
      [id]
    );
    if (claimed.rows.length === 0) return 'skipped';

    let sent: { transactionId: string; status: string };
    try {
      sent = await this.sendUsdc({
        idem: id,
        address,
        amountCents: Number(row.amount_cents),
        description: 'par Noir creator fund payout'
      });
    } catch (e) {
      if (e instanceof CoinbaseSendError && e.definitive) await markFailed();
      return e instanceof Error ? e.message : 'coinbase_send_failed';
    }
    if (FAILED_SEND_STATUSES.has(sent.status)) {
      await markFailed();
      return `coinbase_send_${sent.status}`;
    }
    await db.query(
      `UPDATE creator_fund_payout_requests SET
         status = 'paid',
         crypto_transaction_id = $2,
         updated_at = NOW()
       WHERE id = $1::uuid AND status = 'processing'`,
      [id, sent.transactionId]
    );
    return 'paid';
  }
}
