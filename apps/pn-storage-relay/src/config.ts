import { posix } from 'node:path';
import { isRelayKeySafe, type RelayBackendKind } from './protocol.js';

export interface BackendConfig {
  protocol: RelayBackendKind;
  host: string;
  port: number;
  user: string;
  password?: string;
  /** SFTP only: PEM private key, used instead of or with the password. */
  privateKey?: string;
  /** FTPS only: implicit TLS on connect (usually port 990) instead of AUTH TLS. */
  implicitTls: boolean;
  /** Absolute directory on the server that RELAY_PREFIX sits under. */
  root: string;
}

export interface RelayConfig {
  port: number;
  token: string;
  prefix: string;
  allowedOrigins: string[];
  maxUploadBytes: number;
  backend: BackendConfig;
}

export class ConfigError extends Error {}

const MIN_TOKEN_LENGTH = 32;

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new ConfigError(`${name} is required.`);
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv): RelayConfig {
  const token = required(env, 'RELAY_TOKEN');
  if (token.length < MIN_TOKEN_LENGTH) {
    throw new ConfigError(`RELAY_TOKEN must be at least ${MIN_TOKEN_LENGTH} characters. Generate it in the par Noir dashboard.`);
  }

  const prefix = required(env, 'RELAY_PREFIX').replace(/\/+$/, '');
  if (!isRelayKeySafe(prefix)) throw new ConfigError('RELAY_PREFIX must be a relative path such as par-noir-pn-abc.');

  const allowedOrigins = required(env, 'ALLOWED_ORIGINS')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  for (const origin of allowedOrigins) {
    if (!/^[a-z][a-z0-9+.-]*:\/\/[^/]+$/i.test(origin)) {
      throw new ConfigError(`ALLOWED_ORIGINS entry "${origin}" is not an origin (scheme://host[:port]).`);
    }
  }

  const protocol = required(env, 'STORAGE_PROTOCOL').toLowerCase();
  if (protocol !== 'ftps' && protocol !== 'sftp') {
    throw new ConfigError(
      protocol === 'ftp'
        ? 'Plain FTP sends your password in the clear and is refused. Use ftps or sftp.'
        : 'STORAGE_PROTOCOL must be ftps or sftp.'
    );
  }

  const implicitTls = env.FTPS_IMPLICIT === '1' || env.FTPS_IMPLICIT === 'true';
  const defaultPort = protocol === 'sftp' ? 22 : implicitTls ? 990 : 21;
  const port = env.STORAGE_PORT ? Number(env.STORAGE_PORT) : defaultPort;
  if (!Number.isInteger(port) || port <= 0) throw new ConfigError('STORAGE_PORT must be a port number.');

  const password = env.STORAGE_PASSWORD || undefined;
  const privateKey = env.STORAGE_PRIVATE_KEY?.replace(/\\n/g, '\n') || undefined;
  if (!password && !(protocol === 'sftp' && privateKey)) {
    throw new ConfigError(
      protocol === 'sftp' ? 'Set STORAGE_PASSWORD or STORAGE_PRIVATE_KEY.' : 'STORAGE_PASSWORD is required.'
    );
  }

  const root = posix.normalize(`/${env.STORAGE_ROOT?.trim() || ''}`);
  const maxUploadMb = env.MAX_UPLOAD_MB ? Number(env.MAX_UPLOAD_MB) : 512;

  return {
    port: env.PORT ? Number(env.PORT) : 8080,
    token,
    prefix,
    allowedOrigins,
    maxUploadBytes: Math.max(1, maxUploadMb) * 1024 * 1024,
    backend: {
      protocol,
      host: required(env, 'STORAGE_HOST'),
      port,
      user: required(env, 'STORAGE_USER'),
      password,
      privateKey,
      implicitTls,
      root,
    },
  };
}
