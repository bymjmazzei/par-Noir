// Simple test to verify basic functionality
describe('Simple Tests', () => {
  it('should pass basic test', () => {
    expect(1 + 1).toBe(2);
  });

  it('should have crypto available', () => {
    expect(typeof crypto).toBe('object');
    expect(typeof crypto.subtle).toBe('object');
  });

  it('should have TextEncoder available', () => {
    expect(typeof TextEncoder).toBe('function');
  });

  it('should have TextDecoder available', () => {
    expect(typeof TextDecoder).toBe('function');
  });
});
