/**
 * Keep-alive contract: AuthenticatedShell must keep tab panels mounted with
 * data-dashboard-tab + hidden, not conditional mount (`activeTab === &&`).
 */
import fs from 'fs';
import path from 'path';

describe('AuthenticatedShell tab keep-alive contract', () => {
  it('renders all dashboard tabs with hidden keep-alive markers', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../App/AuthenticatedShell.tsx'),
      'utf8'
    );
    for (const tab of ['privacy', 'recovery', 'storage', 'monetization', 'subpn', 'delegation']) {
      expect(src).toContain(`data-dashboard-tab="${tab}"`);
      expect(src).toContain(`hidden={activeTab !== '${tab}'}`);
    }
    // Regression: do not remount Storage via activeTab === 'storage' &&
    expect(src).not.toMatch(/activeTab === 'storage' &&\s*\(/);
  });
});
