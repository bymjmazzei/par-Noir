import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const base = {
  RELAY_TOKEN: 'a'.repeat(43),
  RELAY_PREFIX: 'par-noir-pn-abc',
  ALLOWED_ORIGINS: 'https://app.parnoir.com, https://dashboard.parnoir.com/',
  STORAGE_PROTOCOL: 'sftp',
  STORAGE_HOST: 'files.example',
  STORAGE_USER: 'me',
  STORAGE_PASSWORD: 'pw',
};

describe('loadConfig', () => {
  it('reads a valid SFTP setup with defaults', () => {
    const cfg = loadConfig(base);
    expect(cfg.allowedOrigins).toEqual(['https://app.parnoir.com', 'https://dashboard.parnoir.com']);
    expect(cfg.backend).toMatchObject({ protocol: 'sftp', port: 22, root: '/' });
  });

  it('refuses plain FTP', () => {
    expect(() => loadConfig({ ...base, STORAGE_PROTOCOL: 'ftp' })).toThrow(/Plain FTP/);
  });

  it('refuses a short token, an escaping prefix and a non-origin', () => {
    expect(() => loadConfig({ ...base, RELAY_TOKEN: 'short' })).toThrow(/RELAY_TOKEN/);
    expect(() => loadConfig({ ...base, RELAY_PREFIX: '../x' })).toThrow(/RELAY_PREFIX/);
    expect(() => loadConfig({ ...base, ALLOWED_ORIGINS: 'https://app.parnoir.com/path' })).toThrow(/ALLOWED_ORIGINS/);
  });

  it('uses port 990 for implicit FTPS', () => {
    expect(loadConfig({ ...base, STORAGE_PROTOCOL: 'ftps', FTPS_IMPLICIT: '1' }).backend.port).toBe(990);
  });
});
