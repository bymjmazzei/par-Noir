import { describe, expect, it } from 'vitest';
import {
  assertSafePublicFetchUrl,
  isAllowedPublicFetchHost,
  isSafePublicFetchUrlShape,
  UnsafePublicFetchUrlError,
} from './safePublicFetchUrl';

describe('safePublicFetchUrl', () => {
  it('allows Drive uc download URL', () => {
    const url =
      'https://drive.google.com/uc?export=download&id=abc&confirm=t';
    expect(assertSafePublicFetchUrl(url, 'google_drive').hostname).toBe('drive.google.com');
    expect(isSafePublicFetchUrlShape(url, 'google_drive')).toBe(true);
  });

  it('allows drive.usercontent.google.com', () => {
    expect(
      isAllowedPublicFetchHost('drive.usercontent.google.com', 'google_drive')
    ).toBe(true);
  });

  it('rejects http scheme', () => {
    expect(() =>
      assertSafePublicFetchUrl('http://drive.google.com/uc?id=x', 'google_drive')
    ).toThrow(UnsafePublicFetchUrlError);
  });

  it('rejects metadata IP literal', () => {
    expect(() =>
      assertSafePublicFetchUrl('https://169.254.169.254/latest/meta-data/', 'google_drive')
    ).toThrow(/blocked|allowlisted|PRIVATE/i);
  });

  it('rejects localhost', () => {
    expect(() =>
      assertSafePublicFetchUrl('https://localhost/secret', 'google_drive')
    ).toThrow(UnsafePublicFetchUrlError);
  });

  it('rejects loopback IP', () => {
    expect(() =>
      assertSafePublicFetchUrl('https://127.0.0.1/x', 'google_drive')
    ).toThrow(UnsafePublicFetchUrlError);
  });

  it('rejects host not on backend allowlist', () => {
    expect(() =>
      assertSafePublicFetchUrl('https://evil.example/x', 'google_drive')
    ).toThrow(/allowlisted/);
  });

  it('rejects unknown backend', () => {
    expect(() =>
      assertSafePublicFetchUrl('https://drive.google.com/uc?id=x', 'ftp')
    ).toThrow(/allowlist/);
  });

  it('rejects URL credentials', () => {
    expect(() =>
      assertSafePublicFetchUrl('https://user:pass@drive.google.com/uc?id=x', 'google_drive')
    ).toThrow(/credentials/);
  });
});
