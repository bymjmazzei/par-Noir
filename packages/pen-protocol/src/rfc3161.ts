/**
 * RFC 3161 timestamps for Pen chain proofs: build a TimeStampReq, read a TimeStampResp, and read
 * the TSTInfo (time, message imprint, nonce) inside a TimeStampToken. Validating the TSA's CMS
 * signature and certificate is left to a validator that holds the TSA trust anchors.
 */

const SHA256_OID = '2.16.840.1.101.3.4.2.1';
const TST_INFO_OID = '1.2.840.113549.1.9.16.1.4';

interface Tlv {
  tag: number;
  /** Header start. */
  offset: number;
  /** Content start. */
  start: number;
  end: number;
  next: number;
}

function readTlv(der: Uint8Array, offset: number): Tlv {
  const tag = der[offset];
  let len = der[offset + 1];
  let start = offset + 2;
  if (tag === undefined || len === undefined) throw new Error('der_truncated');
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0 || n > 4) throw new Error('der_length');
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + (der[start + i] ?? 0);
    start += n;
  }
  const end = start + len;
  if (end > der.length) throw new Error('der_truncated');
  return { tag, offset, start, end, next: end };
}

function children(der: Uint8Array, parent: Tlv): Tlv[] {
  const out: Tlv[] = [];
  let at = parent.start;
  while (at < parent.end) {
    const t = readTlv(der, at);
    out.push(t);
    at = t.next;
  }
  return out;
}

function oid(der: Uint8Array, t: Tlv): string {
  const b = der.subarray(t.start, t.end);
  const first = b[0] ?? 0;
  const parts = [Math.floor(first / 40), first % 40];
  let v = 0;
  for (let i = 1; i < b.length; i++) {
    v = v * 128 + (b[i]! & 0x7f);
    if (!(b[i]! & 0x80)) {
      parts.push(v);
      v = 0;
    }
  }
  return parts.join('.');
}

function hex(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
}

function generalizedTime(der: Uint8Array, t: Tlv): string {
  const s = new TextDecoder().decode(der.subarray(t.start, t.end));
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\.\d+)?Z$/.exec(s);
  if (!m) throw new Error('der_time');
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] ?? ''}Z`).toISOString();
}

function must(t: Tlv | undefined, tag: number): Tlv {
  if (!t || t.tag !== tag) throw new Error('der_shape');
  return t;
}

function encode(tag: number, content: Uint8Array): Uint8Array {
  const len = content.length;
  const head =
    len < 0x80
      ? [tag, len]
      : len < 0x100
        ? [tag, 0x81, len]
        : [tag, 0x82, len >> 8, len & 0xff];
  const out = new Uint8Array(head.length + len);
  out.set(head, 0);
  out.set(content, head.length);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function positiveInteger(bytes: Uint8Array): Uint8Array {
  return encode(0x02, (bytes[0] ?? 0) & 0x80 ? concat(new Uint8Array([0]), bytes) : bytes);
}

const SHA256_ALG = encode(
  0x30,
  concat(encode(0x06, new Uint8Array([0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01])), new Uint8Array([0x05, 0x00]))
);

/** TimeStampReq for a SHA-256 imprint, asking for the TSA certificate in the reply. */
export function buildTimeStampRequest(imprintSha256: Uint8Array, nonce: Uint8Array): Uint8Array {
  if (imprintSha256.length !== 32) throw new Error('imprint_must_be_sha256');
  return encode(
    0x30,
    concat(
      encode(0x02, new Uint8Array([1])),
      encode(0x30, concat(SHA256_ALG, encode(0x04, imprintSha256))),
      positiveInteger(nonce),
      new Uint8Array([0x01, 0x01, 0xff])
    )
  );
}

/** PKI status (0 granted, 1 granted with mods) and the TimeStampToken bytes, if any. */
export function parseTimeStampResponse(der: Uint8Array): { status: number; token: Uint8Array | null } {
  const top = must(readTlv(der, 0), 0x30);
  const [statusInfo, token] = children(der, top);
  const statusInt = must(children(der, must(statusInfo, 0x30))[0], 0x02);
  const status = der[statusInt.end - 1] ?? 2;
  if (!token) return { status, token: null };
  return { status, token: der.slice(token.offset, token.end) };
}

export interface TimeStampInfo {
  genTime: string;
  imprintAlgorithm: string;
  imprintHex: string;
  serialHex: string;
  policy: string;
  nonceHex: string | null;
}

/** TSTInfo from a TimeStampToken (CMS SignedData). */
export function parseTimeStampToken(der: Uint8Array): TimeStampInfo {
  const contentInfo = must(readTlv(der, 0), 0x30);
  const [, signedWrap] = children(der, contentInfo);
  const signedData = must(children(der, must(signedWrap, 0xa0))[0], 0x30);
  const encap = must(children(der, signedData)[2], 0x30);
  const [eType, eWrap] = children(der, encap);
  if (oid(der, must(eType, 0x06)) !== TST_INFO_OID) throw new Error('not_tst_info');
  const octets = must(children(der, must(eWrap, 0xa0))[0], 0x04);
  const info = must(readTlv(der, octets.start), 0x30);
  const f = children(der, info);
  const policy = oid(der, must(f[1], 0x06));
  const [alg, digest] = children(der, must(f[2], 0x30));
  const imprintAlgorithm = oid(der, must(children(der, must(alg, 0x30))[0], 0x06));
  const serial = must(f[3], 0x02);
  const genTime = generalizedTime(der, must(f[4], 0x18));
  let nonceHex: string | null = null;
  for (const extra of f.slice(5)) {
    if (extra.tag === 0x02) {
      nonceHex = hex(der.subarray(extra.start, extra.end)).replace(/^00/, '');
      break;
    }
  }
  return {
    genTime,
    imprintAlgorithm,
    imprintHex: hex(der.subarray(must(digest, 0x04).start, digest!.end)),
    serialHex: hex(der.subarray(serial.start, serial.end)),
    policy,
    nonceHex,
  };
}

/** True when the token stamps exactly this SHA-256 imprint. */
export function timeStampTokenMatches(der: Uint8Array, imprintSha256Hex: string): boolean {
  try {
    const info = parseTimeStampToken(der);
    return info.imprintAlgorithm === SHA256_OID && info.imprintHex === imprintSha256Hex.toLowerCase();
  } catch {
    return false;
  }
}
