/**
 * @jest-environment node
 */
jest.mock('../../utils/logger', () => ({
  safeLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  hashIdentifier: (v: string) => `hash(${v})`,
}));

import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';
import {
  assertSafePublicFetchUrlResolved,
  fetchSafePublicBytes,
  UnsafePublicFetchUrlError,
} from './safePublicFetchUrl';
import { fetchPublicBytesTimed, PublicBlobAccessError } from './publicBlobAccess';

describe('safePublicFetchUrl (API)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('rejects metadata IP before fetch', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      assertSafePublicFetchUrlResolved('https://169.254.169.254/latest/', 'google_drive')
    ).rejects.toBeInstanceOf(UnsafePublicFetchUrlError);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects localhost before fetch', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      assertSafePublicFetchUrlResolved('https://localhost/x', 'google_drive')
    ).rejects.toBeInstanceOf(UnsafePublicFetchUrlError);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects redirect hop to private IP', async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('drive.google.com')) {
        return new Response(null, {
          status: 302,
          headers: { Location: 'https://127.0.0.1/steal' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    // Mock DNS for drive.google.com to a public IP so first hop passes
    const dns = await import('dns');
    const resolve4 = jest.spyOn(dns.promises, 'resolve4').mockResolvedValue(['142.250.190.78']);
    const resolve6 = jest.spyOn(dns.promises, 'resolve6').mockResolvedValue([]);

    await expect(
      fetchSafePublicBytes(
        'https://drive.google.com/uc?export=download&id=abc&confirm=t',
        'google_drive'
      )
    ).rejects.toBeInstanceOf(UnsafePublicFetchUrlError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolve4.mockRestore();
    resolve6.mockRestore();
  });

  it('allows good Drive URL through host rules then fetch', async () => {
    const dns = await import('dns');
    const resolve4 = jest.spyOn(dns.promises, 'resolve4').mockResolvedValue(['142.250.190.78']);
    const resolve6 = jest.spyOn(dns.promises, 'resolve6').mockResolvedValue([]);

    const body = Buffer.from('cipher-bytes');
    global.fetch = jest.fn(async () => {
      return new Response(body, {
        status: 200,
        headers: { 'content-type': 'application/octet-stream' },
      });
    }) as unknown as typeof fetch;

    const result = await fetchSafePublicBytes(
      'https://drive.google.com/uc?export=download&id=abc&confirm=t',
      'google_drive'
    );
    expect(result.status).toBe(200);
    expect(result.buffer.equals(body)).toBe(true);

    resolve4.mockRestore();
    resolve6.mockRestore();
  });
});

describe('fetchPublicBytesTimed SSRF', () => {
  afterEach(() => {
    global.fetch = undefined as unknown as typeof fetch;
  });

  it('does not fetch evil publicUrl', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      fetchPublicBytesTimed({
        backend: 'google_drive',
        objectId: 'obj',
        publicUrl: 'https://169.254.169.254/meta',
      })
    ).rejects.toBeInstanceOf(PublicBlobAccessError);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
