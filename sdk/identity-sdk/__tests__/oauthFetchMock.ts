import type { Identity } from '../src/types';

const mockUser: Identity = {
  id: 'user-1',
  username: 'tester',
  displayName: 'Test User',
  email: 'test@example.com',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  status: 'active',
  metadata: {},
};

/**
 * Minimal fetch mock: token exchange + userinfo succeed for OAuth callback tests.
 */
export function mockFetchOAuthSuccess(): jest.MockedFunction<typeof fetch> {
  return jest.fn(
    async (input: RequestInfo | URL): Promise<Response> => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/token')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'mock-access-token',
            refresh_token: 'mock-refresh-token',
            expires_in: 3600,
          }),
        } as Response;
      }
      if (url.includes('userinfo')) {
        return {
          ok: true,
          status: 200,
          json: async () => mockUser,
        } as Response;
      }
      return {
        ok: false,
        status: 404,
        json: async () => ({}),
      } as Response;
    }
  ) as jest.MockedFunction<typeof fetch>;
}
