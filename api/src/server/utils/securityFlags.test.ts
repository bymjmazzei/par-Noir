/**
 * @jest-environment node
 */
import { isProduction } from './securityFlags';

describe('isProduction', () => {
  const orig = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = orig;
  });

  it('returns true when NODE_ENV is production', () => {
    process.env.NODE_ENV = 'production';
    expect(isProduction()).toBe(true);
  });

  it('returns false when NODE_ENV is not production', () => {
    process.env.NODE_ENV = 'development';
    expect(isProduction()).toBe(false);
  });
});
