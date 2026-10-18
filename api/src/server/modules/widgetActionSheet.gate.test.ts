/**
 * @jest-environment node
 *
 * Widget sheet writes run on the owner's device (device-cloud-credentials), not on the API.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('widget action sheet', () => {
  it('device package owns poll sheet writes', () => {
    const dcc = resolve(__dirname, '../../../../packages/device-cloud-credentials/src/penWidgetSheet.ts');
    const src = readFileSync(dcc, 'utf8');
    expect(src).toMatch(/applyWidgetSheetRows/);
    expect(src).toMatch(/voteMatrixRow/);
    expect(src).toMatch(/upsertUserRow/);
    const routes = readFileSync(resolve(__dirname, 'penRoutes.ts'), 'utf8');
    expect(routes).not.toMatch(/pollSheetDrive/);
  });
});
