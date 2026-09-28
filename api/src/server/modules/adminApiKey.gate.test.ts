/**
 * @jest-environment node
 *
 * Admin routes accept only the admin key. A client-supplied principal header
 * is not an identity.
 */
jest.mock('./auditService', () => ({
  appendSecurityAuditEvent: jest.fn().mockResolvedValue(undefined),
  appendAuditEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../utils/logger', () => ({
  safeLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  hashIdentifier: (v: string) => `hash(${v})`,
}));

import type { NextFunction, Request, Response } from 'express';
import { requireAdminApiKey } from './adminDeveloperRoutes';

function invoke(headers: Record<string, string>): { status: number; nexted: boolean } {
  const req = { headers } as Request;
  let status = 0;
  const res = {
    status(code: number) {
      status = code;
      return this;
    },
    json() {
      return this;
    },
  } as unknown as Response;
  let nexted = false;
  const next: NextFunction = () => {
    nexted = true;
  };
  requireAdminApiKey(req, res, next);
  return { status, nexted };
}

describe('requireAdminApiKey', () => {
  const original = process.env.ADMIN_API_KEY;

  afterEach(() => {
    if (original === undefined) delete process.env.ADMIN_API_KEY;
    else process.env.ADMIN_API_KEY = original;
  });

  it('rejects X-Admin-Principal without the admin key', () => {
    process.env.ADMIN_API_KEY = 'admin-secret-value';
    const result = invoke({ 'x-admin-principal': 'user:admin@parnoir.com' });
    expect(result.nexted).toBe(false);
    expect(result.status).toBe(401);
  });

  it('accepts a matching X-Admin-Key', () => {
    process.env.ADMIN_API_KEY = 'admin-secret-value';
    const result = invoke({ 'x-admin-key': 'admin-secret-value' });
    expect(result.nexted).toBe(true);
    expect(result.status).toBe(0);
  });
});
