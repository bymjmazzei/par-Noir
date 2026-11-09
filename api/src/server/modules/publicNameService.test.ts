import { normalizeDomainInput, domainToCandidateName } from './publicNameService';

describe('publicNameService helpers', () => {
  test('normalizeDomainInput strips protocol and www', () => {
    expect(normalizeDomainInput('https://www.MjMazzei.com/path')).toBe('mjmazzei.com');
  });

  test('domainToCandidateName uses registrable label', () => {
    expect(domainToCandidateName('mjmazzei.com')).toBe('mjmazzei');
    expect(domainToCandidateName('pepsi.co.uk')).toBe('pepsi');
    expect(domainToCandidateName('127.0.0.1')).toBeNull();
  });
});
