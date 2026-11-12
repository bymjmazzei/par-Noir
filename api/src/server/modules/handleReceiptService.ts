/**
 * Registry-signed handle receipts. The registry ML-DSA key comes from
 * NAME_REGISTRY_SIGNING_SEED (base64, 32 bytes); its public key is served at
 * /.well-known/parnoir-name-registry-key. The device stores receipts in the owner's Drive.
 */

import { randomBytes } from 'crypto';
import { base64ToBytes, bytesToBase64 } from '@par-noir/pqc-crypto/encoding';
import { mlDsa65Keygen } from '@par-noir/pqc-crypto/ml-dsa';
import {
  buildHandleReceipt,
  proofStrength,
  type HandleProofType,
  type HandleReceipt,
  type HandleReceiptEvent,
  type SignedHandleReceipt
} from '@par-noir/public-names';

export type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
};

type RegistryKeys = { publicKey: Uint8Array; secretKey: Uint8Array };

let keys: RegistryKeys | null | undefined;

function registryKeys(): RegistryKeys | null {
  if (keys !== undefined) return keys;
  const seedB64 = String(process.env.NAME_REGISTRY_SIGNING_SEED || '').trim();
  if (seedB64) {
    const seed = base64ToBytes(seedB64);
    keys = seed.length === 32 ? mlDsa65Keygen(seed) : null;
    if (!keys) console.error('[handle-receipts] NAME_REGISTRY_SIGNING_SEED must be 32 bytes; receipts disabled');
  } else if (process.env.NODE_ENV === 'production') {
    console.error('[handle-receipts] NAME_REGISTRY_SIGNING_SEED missing; receipts disabled');
    keys = null;
  } else {
    console.warn('[handle-receipts] NAME_REGISTRY_SIGNING_SEED unset; using an ephemeral dev key');
    keys = mlDsa65Keygen(new Uint8Array(randomBytes(32)));
  }
  return keys;
}

function iso(v: unknown): string {
  const t = v ? Date.parse(String(v instanceof Date ? v.toISOString() : v)) : NaN;
  return Number.isNaN(t) ? new Date().toISOString() : new Date(t).toISOString();
}

export class HandleReceiptService {
  static publicKeyB64(): string | null {
    const k = registryKeys();
    return k ? bytesToBase64(k.publicKey) : null;
  }

  /** The ML-DSA key a pN registered for its handle receipts, or null. */
  static async signingKeyFor(q: Queryable, pn: string): Promise<string | null> {
    const r = await q.query(`SELECT signing_public_key FROM pn_signing_keys WHERE pn_identifier = $1`, [pn]);
    return r.rows[0]?.signing_public_key ? String(r.rows[0].signing_public_key) : null;
  }

  static async pnForSigningKey(q: Queryable, signingKey: string): Promise<string | null> {
    const r = await q.query(`SELECT pn_identifier FROM pn_signing_keys WHERE signing_public_key = $1 LIMIT 1`, [signingKey]);
    return r.rows[0]?.pn_identifier ? String(r.rows[0].pn_identifier) : null;
  }

  /**
   * Sign a receipt for this row's current state, log it, and move the row's chain head.
   * Taking a handle needs the holder's registered signing key; ending events without one are skipped.
   */
  static async issue(
    q: Queryable,
    row: Record<string, any>,
    event: HandleReceiptEvent,
    prevReceiptHash: string | null
  ): Promise<SignedHandleReceipt | null> {
    const k = registryKeys();
    if (!k) return null;
    const signingKey = await HandleReceiptService.signingKeyFor(q, String(row.pn_identifier));
    if (!signingKey) {
      if (ENDING_EVENTS.includes(event)) return null;
      throw Object.assign(new Error('SIGNING_KEY_REQUIRED'), { code: 'SIGNING_KEY_REQUIRED' });
    }
    const proofType = String(row.proof_type) as HandleProofType;
    const signed = buildHandleReceipt(
      {
        handle: String(row.public_name),
        signingKey,
        proofType,
        strength: Number(row.strength) || proofStrength(proofType),
        priorityAt: iso(row.priority_at ?? row.created_at),
        event,
        prevReceiptHash: prevReceiptHash || null
      },
      k.secretKey
    );
    await q.query(
      `INSERT INTO public_name_receipts (receipt_hash, public_name, owner_pn_identifier, receipt, signature)
       VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [signed.hash, signed.receipt.handle, String(row.pn_identifier), JSON.stringify(signed.receipt), signed.signature]
    );
    await q.query(
      `UPDATE public_names SET receipt_hash = $1 WHERE proof_type = $2 AND proof_subject = $3`,
      [signed.hash, row.proof_type, row.proof_subject]
    );
    return signed;
  }

  /**
   * Each handle the owner holds, with its full chain back to the first claim, including
   * receipts issued to earlier holders: that history is what proves the priority date.
   */
  static async chainsForOwner(
    q: Queryable,
    pn: string
  ): Promise<Array<{ handle: string; chain: Array<{ receipt: HandleReceipt; signature: string; hash: string }> }>> {
    const heads = await q.query(
      `SELECT public_name, receipt_hash FROM public_names
       WHERE pn_identifier = $1 AND receipt_hash IS NOT NULL
         AND status IN ('listed', 'disputed', 'proven', 'superseded', 'released', 'expired')`,
      [pn]
    );
    const byHandle = new Map<string, Array<{ receipt: HandleReceipt; signature: string; hash: string }>>();
    for (const head of heads.rows) {
      const chain: Array<{ receipt: HandleReceipt; signature: string; hash: string }> = [];
      const seen = new Set<string>();
      let next: string | null = String(head.receipt_hash);
      while (next && !seen.has(next) && chain.length < MAX_CHAIN) {
        seen.add(next);
        const r = await q.query(
          `SELECT receipt_hash, receipt, signature FROM public_name_receipts WHERE receipt_hash = $1`,
          [next]
        );
        const row = r.rows[0];
        if (!row) break;
        const receipt = row.receipt as HandleReceipt;
        chain.unshift({ receipt, signature: String(row.signature), hash: String(row.receipt_hash) });
        next = receipt.prevReceiptHash ?? null;
      }
      const handle = String(head.public_name);
      if (chain.length > (byHandle.get(handle)?.length ?? 0)) byHandle.set(handle, chain);
    }
    return [...byHandle].map(([handle, chain]) => ({ handle, chain }));
  }

  /** Head receipt of a held handle: what a verifier checks a content signature's key against. */
  static async latestForHandle(
    q: Queryable,
    handle: string
  ): Promise<{ receipt: HandleReceipt; signature: string; hash: string } | null> {
    const head = await q.query(
      `SELECT r.receipt_hash, r.receipt, r.signature FROM public_names pn
       JOIN public_name_receipts r ON r.receipt_hash = pn.receipt_hash
       WHERE pn.public_name = $1 AND pn.status IN ('listed', 'disputed')
       LIMIT 1`,
      [handle]
    );
    const row = head.rows[0];
    if (!row) return null;
    return { receipt: row.receipt as HandleReceipt, signature: String(row.signature), hash: String(row.receipt_hash) };
  }
}

const MAX_CHAIN = 256;
const ENDING_EVENTS: readonly HandleReceiptEvent[] = ['supersede', 'release', 'expire'];

/** Test hook: reset the cached key so a test can set NAME_REGISTRY_SIGNING_SEED. */
export function resetRegistryKeysForTests(): void {
  keys = undefined;
}
