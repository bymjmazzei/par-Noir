/**
 * @jest-environment node
 */
import { Request } from 'express';
import { getBearerTokenPayload } from './authMiddleware';
import { PNOAuthService } from '../modules/pnOAuthService';

jest.mock('../modules/pnOAuthService', () => ({
  PNOAuthService: {
    validateAccessToken: jest.fn(),
  },
}));

const mockValidate = PNOAuthService.validateAccessToken as jest.MockedFunction<
  typeof PNOAuthService.validateAccessToken
>;

describe('getBearerTokenPayload', () => {
  beforeEach(() => {
    mockValidate.mockReset();
  });

  it('returns null when Authorization is missing', () => {
    const req = { headers: {} } as Request;
    expect(getBearerTokenPayload(req)).toBeNull();
    expect(mockValidate).not.toHaveBeenCalled();
  });

  it('returns null when Bearer token is empty', () => {
    const req = { headers: { authorization: 'Bearer ' } } as unknown as Request;
    expect(getBearerTokenPayload(req)).toBeNull();
    expect(mockValidate).not.toHaveBeenCalled();
  });

  it('delegates to PNOAuthService.validateAccessToken for Bearer token', () => {
    const payload = {
      did: 'did:key:test',
      clientId: 'browser-app',
      scope: [],
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600_000,
    };
    mockValidate.mockReturnValue(payload);
    const req = { headers: { authorization: 'Bearer abc.def.ghi' } } as unknown as Request;
    expect(getBearerTokenPayload(req)).toBe(payload);
    expect(mockValidate).toHaveBeenCalledWith('abc.def.ghi');
  });
});
