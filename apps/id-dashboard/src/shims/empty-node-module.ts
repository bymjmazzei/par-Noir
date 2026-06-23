/** Stub for Node-only native modules — must not run in the browser bundle. */
const unavailable = (): never => {
  throw new Error('This module is not available in the browser');
};

export default new Proxy({} as Record<string, unknown>, {
  get: () => unavailable,
  apply: unavailable,
});
