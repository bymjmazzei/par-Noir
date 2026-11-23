import initSqlJs, { type SqlJsStatic } from 'sql.js';

type SqlJsLoadOptions = {
  locateFile?: (file: string) => string;
  wasmBinary?: ArrayBuffer;
};

let options: SqlJsLoadOptions = {};
let ready: Promise<SqlJsStatic> | null = null;

/**
 * Point sql.js at its wasm file. Browsers must call this once with the bundled
 * asset URL (e.g. Vite's `sql.js/dist/sql-wasm.wasm?url`); Node finds it itself.
 */
export function configureSqlJs(next: SqlJsLoadOptions): void {
  options = next;
  ready = null;
}

export function loadSqlJs(): Promise<SqlJsStatic> {
  if (!ready) {
    // @types/sql.js >= 1.16 requires useOldExtensionFunctions when a config
    // object is passed (default true = legacy sql.js Math helpers).
    ready = initSqlJs({
      ...options,
      useOldExtensionFunctions: true,
    }).catch((err: unknown) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}
