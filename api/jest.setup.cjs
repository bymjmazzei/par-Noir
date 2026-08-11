/**
 * Deterministic environment for unit tests.
 *
 * Modules that read config at import time (e.g. storageCredentialsService) throw when a
 * required variable is unset. These placeholders are test-only and must never be real values;
 * anything that needs a live credential belongs in an integration test, not here.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.STORAGE_CREDENTIALS_SECRET =
  process.env.STORAGE_CREDENTIALS_SECRET || 'test-only-placeholder-not-a-real-secret';
process.env.MAILBOX_ROUTE_PEPPER =
  process.env.MAILBOX_ROUTE_PEPPER || 'test-only-mailbox-route-pepper';
