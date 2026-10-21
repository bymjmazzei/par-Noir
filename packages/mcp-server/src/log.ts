import { createHash } from 'node:crypto';

/** Primitive fields only. Identifiers must go through hashId first. */
export type LogFields = Record<string, string | number | boolean | undefined>;

export interface Logger {
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
}

export function hashId(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function format(level: string, event: string, fields?: LogFields): string {
  const parts = Object.entries(fields ?? {})
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${String(v)}`);
  return [`[pn-mcp] ${level} ${event}`, ...parts].join(' ');
}

/** stdout carries the MCP protocol, so every log line goes to stderr. */
export function createLogger(write: (line: string) => void = (line) => process.stderr.write(`${line}\n`)): Logger {
  return {
    info: (event, fields) => write(format('info', event, fields)),
    warn: (event, fields) => write(format('warn', event, fields)),
  };
}
