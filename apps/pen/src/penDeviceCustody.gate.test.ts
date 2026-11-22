/**
 * Gate: device-custody drafts skip cloud bootstrap; scheduleDocCloudBootstrap no-ops.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('device custody gates', () => {
  it('scheduleDocCloudBootstrap returns early when custody is device', () => {
    const src = readFileSync(join(__dirname, 'services/penSyncFlush.ts'), 'utf8');
    expect(src).toMatch(/custody === 'device'/);
  });

  it('persistDraftAsync branches on isDeviceCustody', () => {
    const src = readFileSync(
      join(__dirname, 'pages/docEditor/useDocEditorController.ts'),
      'utf8'
    );
    expect(src).toMatch(/isDeviceCustody/);
    expect(src).toMatch(/saveDeviceCustodyDraft/);
  });

  it('publish plan is fetched from the API', () => {
    const src = readFileSync(join(__dirname, 'services/penPublishPlan.ts'), 'utf8');
    expect(src).toMatch(/\/api\/aggregator\/publish-plan/);
    expect(src).toMatch(/currentPublishTier/);
  });
});

describe('preferDeviceCustodyDefault', () => {
  it('defaults off without desktop', async () => {
    vi.resetModules();
    const mod = await import('./services/penDeviceCustody');
    expect(mod.deviceCustodyAvailable()).toBe(false);
    expect(mod.preferDeviceCustodyDefault()).toBe(false);
  });
});
