import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

describe('social toolbar toggle visuals', () => {
  it('DocEditorShell styles active vs inactive globe', () => {
    const shell = readFileSync(resolve(here, 'pages/docEditor/DocEditorShell.tsx'), 'utf8');
    expect(shell).toContain('aria-pressed={isSocialActive}');
    expect(shell).toContain('opacity-100');
    expect(shell).toContain('opacity-45');
    expect(shell).toContain('stroke-current');
  });
});
