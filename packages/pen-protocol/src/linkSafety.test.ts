import { describe, expect, it } from 'vitest';
import { checkLink } from './linkSafety.js';

function blocked(raw: string) {
  const v = checkLink(raw);
  return v.ok ? null : v.reason;
}

function warnings(raw: string, label?: string) {
  const v = checkLink(raw, label);
  if (!v.ok) throw new Error(`blocked: ${v.reason}`);
  return v.warnings;
}

describe('checkLink blocks', () => {
  it('empty and unparsable', () => {
    expect(blocked('')).toBe('invalid');
    expect(blocked('   ')).toBe('invalid');
    expect(blocked('https://')).toBe('invalid');
  });

  it('anything but https', () => {
    expect(blocked('http://example.com')).toBe('not_https');
    expect(blocked('javascript:alert(1)')).toBe('not_https');
    expect(blocked('data:text/html,<b>x</b>')).toBe('not_https');
    expect(blocked('file:///etc/passwd')).toBe('not_https');
    expect(blocked('ftp://example.com')).toBe('not_https');
  });

  it('credentials before the host', () => {
    expect(blocked('https://parnoir.com@evil.com')).toBe('credentials');
    expect(blocked('https://user:pw@example.com')).toBe('credentials');
  });

  it('IPs and local hosts', () => {
    expect(blocked('https://192.168.1.1/login')).toBe('ip_or_local');
    expect(blocked('https://0x7f000001/')).toBe('ip_or_local');
    expect(blocked('https://[::1]/')).toBe('ip_or_local');
    expect(blocked('https://localhost:3000')).toBe('ip_or_local');
    expect(blocked('https://printer.local')).toBe('ip_or_local');
    expect(blocked('https://wiki.internal')).toBe('ip_or_local');
    expect(blocked('https://intranet')).toBe('ip_or_local');
  });

  it('blocklisted hosts and their subdomains', () => {
    expect(blocked('https://grabify.link/abc')).toBe('blocklisted');
    expect(blocked('https://abc123.ngrok-free.app')).toBe('blocklisted');
  });
});

describe('checkLink allows', () => {
  it('normalizes a bare domain to https', () => {
    expect(checkLink('example.com/path')).toEqual({
      ok: true,
      url: 'https://example.com/path',
      host: 'example.com',
      warnings: []
    });
  });

  it('flags lookalike hosts', () => {
    expect(warnings('https://pаrnoir.com')).toContain('lookalike_host');
  });

  it('flags risky downloads', () => {
    expect(warnings('https://example.com/setup.exe')).toEqual(['download']);
    expect(warnings('https://example.com/report.pdf')).toEqual([]);
  });

  it('flags link shorteners', () => {
    expect(warnings('https://bit.ly/x')).toEqual(['shortener']);
  });

  it('flags a label that names another site', () => {
    expect(warnings('https://evil.example', 'Visit paypal.com')).toEqual(['label_mismatch']);
    expect(warnings('https://evil.example', 'Sign in to par Noir')).toEqual(['label_mismatch']);
    expect(warnings('https://www.paypal.com/x', 'Visit paypal.com')).toEqual([]);
    expect(warnings('https://id.parnoir.com', 'Open par Noir')).toEqual([]);
    expect(warnings('https://example.com', 'Read more')).toEqual([]);
  });
});
