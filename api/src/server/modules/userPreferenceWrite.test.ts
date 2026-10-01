/**
 * @jest-environment node
 */
process.env.NODE_ENV = 'test';

import { UserPreferenceService } from './userPreferenceService';
import { getDatabasePool } from '../utils/database';

jest.mock('../utils/database', () => ({
  getDatabasePool: jest.fn(),
}));

describe('tag preference write', () => {
  it('does not insert into user_tag_preferences', async () => {
    const query = jest.fn();
    (getDatabasePool as jest.Mock).mockReturnValue({ query });

    await UserPreferenceService.setTagPreference('pn-viewer', 'horses', 'subscribe', 'preference_tile_yes');

    expect(query).not.toHaveBeenCalled();
  });
});
