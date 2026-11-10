import initSqlJs, { type SqlJsStatic } from 'sql.js';

let options: { locateFile?: (file: string) => string; wasmBinary?: ArrayBuffer } = {};
let ready: Promise<SqlJsStatic> | null = null;

/**
 * Point sql.js at its wasm file. Browsers must call this once with the bundled
 * asset URL (e.g. Vite's `sql.js/dist/sql-wasm.wasm?url`); Node finds it itself.
 */
export function configureSqlJs(next: { locateFile?: (file: string) => string; wasmBinary?: ArrayBuffer }): void {
  options = next;
  ready = null;
}

export function loadSqlJs(): Promise<SqlJsStatic> {
  if (!ready) {
    ready = initSqlJs(options).catch((err: unknown) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}
