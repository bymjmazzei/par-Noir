/**
 * pen-protocol's starterAssets resolves media with import.meta.url, which CommonJS Jest cannot parse.
 * The dashboard only uses Knowledge templates, so tests get stable placeholder URLs instead.
 */
const STARTER_ASSETS = new Proxy(
  {},
  { get: (_target, key) => (typeof key === 'string' ? `starter-assets/${key}` : undefined) }
);

module.exports = { STARTER_ASSETS };
