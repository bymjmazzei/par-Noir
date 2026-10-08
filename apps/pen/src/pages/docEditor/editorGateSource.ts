import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const docEditorDir = dirname(fileURLToPath(import.meta.url));

/** Concatenated editor modules for string-based gate tests. */
export function readDocEditorGateSource(): string {
  const files = [
    'useDocEditorController.ts',
    'DocEditorShell.tsx',
    'DocEditorSocialPreview.tsx'
  ];
  return files.map((f) => readFileSync(resolve(docEditorDir, f), 'utf8')).join('\n\n');
}
