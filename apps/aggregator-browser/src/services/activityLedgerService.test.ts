import { beforeEach, describe, expect, it, vi } from 'vitest';

const listDeviceActivities = vi.fn();
const sessionDriveFor = vi.fn();

vi.mock('@par-noir/device-cloud-credentials', () => ({
  listDeviceActivities: (...args: unknown[]) => listDeviceActivities(...args),
}));

vi.mock('./sessionDrive', () => ({
  sessionDriveFor: (pn: string) => sessionDriveFor(pn),
}));

import { ActivityLedgerService } from './activityLedgerService';

describe('ActivityLedgerService', () => {
  beforeEach(() => {
    listDeviceActivities.mockReset();
    sessionDriveFor.mockReset();
    sessionDriveFor.mockResolvedValue({
      accessToken: 'google-token',
      index: { sheetIds: { activity_ledger: 'sheet-activity' } },
    });
  });

  it('reads the device activity sheet and does not call the API ledger route', async () => {
    listDeviceActivities.mockResolvedValue([
      {
        activity_id: 'act-1',
        user_pn_identifier: 'pn-self',
        activity_type: 'like',
        target_type: 'file',
        target_pn_identifier: 'pn-target',
        actor_pn_identifier: 'pn-actor',
        metadata: {},
        created_at: '2026-01-01',
      },
    ]);

    const result = await ActivityLedgerService.getActivities('pn-self', { activityType: 'like' });
    expect(listDeviceActivities).toHaveBeenCalledWith('google-token', 'sheet-activity');
    expect(result.activities[0]?.activity_type).toBe('like');
    expect(result.activities[0]?.actor_did).toBe('pn-actor');
    expect(result.total).toBe(1);
  });
});
