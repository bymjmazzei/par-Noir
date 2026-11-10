import type { RelayBackendKind, RelayHealth, StorageCredentialsEnvelope } from '@par-noir/user-owned-storage';
import { RELAY_PATHS, isRelayErrorBody } from '@par-noir/user-owned-storage';
import { createDeviceBlobStore, RelayRequestError } from './deviceBlobStore.js';

export type RelayProbeCause =
  | 'not_https'
  /** fetch threw: the URL is wrong, the relay is down, or ALLOWED_ORIGINS leaves out this app (browsers hide which). */
  | 'unreachable_or_cors'
  | 'bad_token'
  | 'origin_not_allowed'
  | 'prefix_mismatch'
  | 'backend_login_failed'
  | 'backend_unreachable'
  | 'no_write_permission'
  | 'read_mismatch'
  | 'relay_error';

export type RelayProbeStep = 'health' | 'write' | 'read' | 'delete';

export type RelayProbeResult =
  | { ok: true; backend: RelayBackendKind }
  | { ok: false; step: RelayProbeStep; cause: RelayProbeCause; message: string };

const TEST_DIR = '.par-noir-relay-test';

function causeFromCode(code: string, step: RelayProbeStep): RelayProbeCause {
  switch (code) {
    case 'unauthorized':
      return 'bad_token';
    case 'origin_not_allowed':
      return 'origin_not_allowed';
    case 'backend_login_failed':
      return 'backend_login_failed';
    case 'backend_unreachable':
      return 'backend_unreachable';
    case 'backend_permission_denied':
      return step === 'read' ? 'relay_error' : 'no_write_permission';
    default:
      return 'relay_error';
  }
}

function failure(step: RelayProbeStep, err: unknown): RelayProbeResult {
  if (err instanceof RelayRequestError) {
    return { ok: false, step, cause: causeFromCode(err.code, step), message: err.message };
  }
  return {
    ok: false,
    step,
    cause: 'unreachable_or_cors',
    message: err instanceof Error ? err.message : String(err),
  };
}

/**
 * Check a relay from this device before saving it: health, then write, read
 * back and delete a test file under the prefix.
 */
export async function probeRelay(opts: {
  url: string;
  token: string;
  prefix: string;
  fetchImpl?: typeof fetch;
}): Promise<RelayProbeResult> {
  const f = opts.fetchImpl ?? fetch;
  const base = opts.url.trim().replace(/\/+$/, '');
  if (!/^https:\/\//i.test(base)) {
    return { ok: false, step: 'health', cause: 'not_https', message: 'The relay URL must start with https://' };
  }

  let health: RelayHealth;
  try {
    const res = await f(`${base}${RELAY_PATHS.health}`, { headers: { Authorization: `Bearer ${opts.token}` } });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      if (isRelayErrorBody(body)) throw new RelayRequestError(body.error, res.status, body.message);
      throw new RelayRequestError('relay_http_error', res.status, `Health check failed: ${res.status}`);
    }
    health = body as RelayHealth;
  } catch (err) {
    return failure('health', err);
  }
  if (health.prefix !== opts.prefix) {
    return {
      ok: false,
      step: 'health',
      cause: 'prefix_mismatch',
      message: `The relay's RELAY_PREFIX is "${health.prefix}", expected "${opts.prefix}".`,
    };
  }

  const envelope = {
    socialCloudProvider: 'relay',
    relayAccounts: [{ accountId: 'probe', url: base, token: opts.token, prefix: opts.prefix }],
  } as StorageCredentialsEnvelope;
  const store = createDeviceBlobStore('probe', envelope, { fetchImpl: f, layoutRoot: '' });
  const key = `${TEST_DIR}/${crypto.randomUUID()}.txt`;
  const text = `par Noir relay check ${new Date().toISOString()}`;

  try {
    await store.put(key, text, { contentType: 'text/plain' });
  } catch (err) {
    return failure('write', err);
  }
  try {
    const back = await store.get(key);
    if (!back || new TextDecoder().decode(back) !== text) {
      return { ok: false, step: 'read', cause: 'read_mismatch', message: 'The test file did not read back the same.' };
    }
  } catch (err) {
    return failure('read', err);
  }
  try {
    await store.delete(key);
  } catch (err) {
    return failure('delete', err);
  }
  return { ok: true, backend: health.backend };
}
