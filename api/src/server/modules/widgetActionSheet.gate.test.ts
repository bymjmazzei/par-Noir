/**
 * @jest-environment node
 *
 * pen.widget_action must write the trigger's tab. Row shape is covered in pen-protocol.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('widget action sheet', () => {
  it('writes the matching tab instead of returning without a write', () => {
    const routes = readFileSync(resolve(__dirname, 'penRoutes.ts'), 'utf8');
    const drive = readFileSync(resolve(__dirname, 'pollSheetDrive.ts'), 'utf8');
    expect(routes).toMatch(/writeWidgetActionTab\(/);
    expect(routes).not.toMatch(/widget\.submit',\s*'widget\.toggle'/);
    expect(drive).toMatch(/applyWidgetSheetRows/);
    expect(drive).toMatch(/addSheet/);
    expect(drive).toMatch(/voteMatrixRow/);
    expect(drive).toMatch(/upsertUserRow/);
  });
});
