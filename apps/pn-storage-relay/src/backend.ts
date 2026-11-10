import type { RelayBackendKind } from './protocol.js';

export interface FileStat {
  size: number;
  modifiedAt?: Date;
}

export interface ListedFile {
  /** Relative to the listed directory. */
  path: string;
  size: number;
  modifiedAt?: Date;
}

/** File operations on the user's server. Paths are absolute and already confined. */
export interface RelayBackend {
  readonly kind: RelayBackendKind;
  read(path: string): Promise<Buffer | null>;
  stat(path: string): Promise<FileStat | null>;
  /** Creates missing parent directories. */
  write(path: string, data: Buffer): Promise<void>;
  /** Recursive; empty when the directory does not exist. */
  list(dir: string): Promise<ListedFile[]>;
  /** No error when the file is already gone. */
  remove(path: string): Promise<void>;
  close(): Promise<void>;
}

export class BackendLoginError extends Error {}
export class BackendPermissionError extends Error {}
export class BackendUnreachableError extends Error {}

const UNREACHABLE_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EHOSTUNREACH', 'ECONNRESET', 'EAI_AGAIN']);

export function isUnreachable(err: unknown): boolean {
  const code = (err as { code?: unknown })?.code;
  return typeof code === 'string' && UNREACHABLE_CODES.has(code);
}

/** Runs one operation at a time on a single connection, reconnecting once if it dropped. */
export class SerialConnection<C> {
  private client: C | null = null;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly connect: () => Promise<C>,
    private readonly disconnect: (client: C) => Promise<void>,
    private readonly isDropped: (err: unknown) => boolean
  ) {}

  run<T>(op: (client: C) => Promise<T>): Promise<T> {
    const next = this.tail.then(() => this.attempt(op, true));
    this.tail = next.catch(() => undefined);
    return next;
  }

  private async attempt<T>(op: (client: C) => Promise<T>, retry: boolean): Promise<T> {
    if (!this.client) this.client = await this.connect();
    try {
      return await op(this.client);
    } catch (err) {
      if (retry && this.isDropped(err)) {
        await this.reset();
        return this.attempt(op, false);
      }
      throw err;
    }
  }

  async reset(): Promise<void> {
    const client = this.client;
    this.client = null;
    if (client) await this.disconnect(client).catch(() => undefined);
  }
}
