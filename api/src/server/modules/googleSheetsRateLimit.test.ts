/**
 * @jest-environment node
 */
import { isGoogleSheetsRateLimit } from './googleSheetsRateLimit';

describe('isGoogleSheetsRateLimit', () => {
  it('returns true for gaxios 429 code', () => {
    expect(isGoogleSheetsRateLimit({ code: 429 })).toBe(true);
  });

  it('returns true for response.status 429', () => {
    expect(isGoogleSheetsRateLimit({ response: { status: 429 } })).toBe(true);
  });

  it('returns false for other errors', () => {
    expect(isGoogleSheetsRateLimit(new Error('not found'))).toBe(false);
    expect(isGoogleSheetsRateLimit({ code: 500 })).toBe(false);
  });
});
