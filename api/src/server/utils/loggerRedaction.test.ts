import { sanitizeForLogs } from '../../utils/logger';

describe('sanitizeForLogs', () => {
  it('redacts sensitive keys recursively', () => {
    const input = {
      authorization: 'Bearer very-secret-token',
      nested: {
        refresh_token: 'abc',
        client_secret: 'xyz',
      },
      safe: 'ok',
    };

    const out = sanitizeForLogs(input) as any;
    expect(out.authorization).toBe('[REDACTED]');
    expect(out.nested.refresh_token).toBe('[REDACTED]');
    expect(out.nested.client_secret).toBe('[REDACTED]');
    expect(out.safe).toBe('ok');
  });
});
