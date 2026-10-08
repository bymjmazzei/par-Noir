import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const docListDir = dirname(fileURLToPath(import.meta.url));

/** Concatenated list page modules for string-based gate tests. */
export function readDocListGateSource(): string {
  const files = ['useDocListController.tsx', 'DocListShell.tsx', 'docListExplorer.tsx'];
  return files.map((f) => readFileSync(resolve(docListDir, f), 'utf8')).join('\n\n');
}
