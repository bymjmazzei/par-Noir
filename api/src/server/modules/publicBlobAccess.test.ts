import { describe, expect, it } from '@jest/globals';
import { drivePublicDownloadUrl } from './publicBlobAccess';

describe('publicBlobAccess', () => {
  it('builds Drive uc download URL without auth headers', () => {
    const url = drivePublicDownloadUrl('abc123');
    expect(url).toContain('drive.google.com/uc');
    expect(url).toContain('id=abc123');
    expect(url).toContain('export=download');
    expect(url).not.toMatch(/access_token|Bearer/i);
  });
});
