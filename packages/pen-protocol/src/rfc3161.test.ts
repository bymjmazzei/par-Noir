import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildTimeStampRequest,
  parseTimeStampResponse,
  parseTimeStampToken,
  timeStampTokenMatches,
} from './rfc3161';

const token = new Uint8Array(readFileSync(new URL('./__fixtures__/digicert-tst.der', import.meta.url)));
const IMPRINT = '221ef9137b0536a27153d124b0b70992238d87680d78dba764f21a5fb0195360';

describe('RFC 3161', () => {
  it('reads time, imprint, serial and nonce from a real DigiCert token', () => {
    expect(parseTimeStampToken(token)).toEqual({
      genTime: '2026-11-12T13:18:04.000Z',
      imprintAlgorithm: '2.16.840.1.101.3.4.2.1',
      imprintHex: IMPRINT,
      serialHex: '7bf51eb768a81b25712c1c4efa2e0e84',
      policy: '2.16.840.1.114412.7.1',
      nonceHex: '08785c0a09129590',
    });
  });

  it('matches only its own imprint', () => {
    expect(timeStampTokenMatches(token, IMPRINT)).toBe(true);
    expect(timeStampTokenMatches(token, IMPRINT.replace(/^22/, '23'))).toBe(false);
    expect(timeStampTokenMatches(token.slice(0, 40), IMPRINT)).toBe(false);
  });

  it('builds a request with the imprint, a positive nonce and certReq', () => {
    const imprint = new Uint8Array(32).fill(7);
    const req = buildTimeStampRequest(imprint, new Uint8Array([0x80, 1, 2, 3]));
    const hex = Buffer.from(req).toString('hex');
    expect(hex.startsWith('30')).toBe(true);
    expect(hex).toContain('0420' + '07'.repeat(32));
    expect(hex).toContain('02050080010203');
    expect(hex.endsWith('0101ff')).toBe(true);
    expect(() => buildTimeStampRequest(new Uint8Array(20), new Uint8Array([1]))).toThrow('imprint_must_be_sha256');
  });

  it('pulls the token out of a granted response', () => {
    const status = Buffer.from('3003020100', 'hex');
    const body = Buffer.concat([status, Buffer.from(token)]);
    const lenBytes = body.length < 0x10000 ? [0x82, body.length >> 8, body.length & 0xff] : [];
    const resp = new Uint8Array(Buffer.concat([Buffer.from([0x30, ...lenBytes]), body]));
    const out = parseTimeStampResponse(resp);
    expect(out.status).toBe(0);
    expect(out.token && Buffer.from(out.token).equals(Buffer.from(token))).toBe(true);
  });
});
