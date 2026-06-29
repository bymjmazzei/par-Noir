import { ThirdPartyPermissionsSheetsService } from '../modules/thirdPartyPermissionsSheetsService';

describe('ThirdPartyPermissionsSheetsService', () => {
  it('parses a canonical permission row', () => {
    const row = [
      'browser-app',
      'par Noir Browser',
      'Official par Noir browser',
      '["openid","profile"]',
      '["age_attestation"]',
      '[]',
      '["age_attestation"]',
      '2026-06-25T11:51:14.767Z',
      '',
      'active',
      '2026-06-25T11:51:14.767Z',
      '2026-06-29T14:00:00.000Z',
      '',
    ];
    const parsed = ThirdPartyPermissionsSheetsService.parsePermissionRow(row);
    expect(parsed?.toolId).toBe('browser-app');
    expect(parsed?.status).toBe('active');
    expect(parsed?.dataPoints).toContain('age_attestation');
  });

  it('parses misaligned rows where tool id is not in column A', () => {
    const row = [
      '',
      '',
      '',
      '',
      '',
      'browser-app',
      'par Noir Browser',
      'Official par Noir browser',
      '["openid","profile"]',
      '[]',
      '[]',
      '["age_attestation"]',
      '2026-06-29T14:24:00.000Z',
      '',
      'active',
    ];
    const parsed = ThirdPartyPermissionsSheetsService.parsePermissionRow(row);
    expect(parsed?.toolId).toBe('browser-app');
    expect(parsed?.status).toBe('active');
  });

  it('normalizes permission status', () => {
    expect(ThirdPartyPermissionsSheetsService.normalizePermissionStatus(' Active ')).toBe('active');
    expect(ThirdPartyPermissionsSheetsService.normalizePermissionStatus('revoked')).toBe('revoked');
    expect(ThirdPartyPermissionsSheetsService.normalizePermissionStatus('')).toBeNull();
  });
});
