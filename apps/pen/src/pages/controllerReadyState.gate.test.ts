import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkControllerReadyState } from './controllerReadyStateValidate';

const pagesDir = dirname(fileURLToPath(import.meta.url));

function read(rel: string): string {
  return readFileSync(resolve(pagesDir, rel), 'utf8');
}

describe('controller ready-state wiring', () => {
  it('doc editor return keys are hook bindings; shells only use exported keys', () => {
    const controller = read('docEditor/useDocEditorController.ts');
    const shell = read('docEditor/DocEditorShell.tsx');
    const social = read('docEditor/DocEditorSocialPreview.tsx');
    const result = checkControllerReadyState({
      controllerSource: controller,
      hookName: 'useDocEditorController',
      shellSources: [
        { source: shell, exportName: 'DocEditorShell' },
        { source: social, exportName: 'DocEditorSocialPreview' }
      ]
    });
    expect(result.orphanReturnKeys, `orphan return keys: ${result.orphanReturnKeys.join(', ')}`).toEqual(
      []
    );
    expect(
      result.missingConsumerKeys,
      `missing exports for consumers: ${result.missingConsumerKeys.join(', ')}`
    ).toEqual([]);
    expect(
      result.unboundShellRefs,
      `unbound shell identifiers: ${result.unboundShellRefs.join(', ')}`
    ).toEqual([]);
  });

  it('doc list return keys are hook bindings; shell only uses exported keys', () => {
    const controller = read('docList/useDocListController.tsx');
    const shell = read('docList/DocListShell.tsx');
    const result = checkControllerReadyState({
      controllerSource: controller,
      hookName: 'useDocListController',
      shellSources: [{ source: shell, exportName: 'DocListShell' }]
    });
    expect(result.orphanReturnKeys, `orphan return keys: ${result.orphanReturnKeys.join(', ')}`).toEqual(
      []
    );
    expect(
      result.missingConsumerKeys,
      `missing exports for consumers: ${result.missingConsumerKeys.join(', ')}`
    ).toEqual([]);
    expect(
      result.unboundShellRefs,
      `unbound shell identifiers: ${result.unboundShellRefs.join(', ')}`
    ).toEqual([]);
  });
});
