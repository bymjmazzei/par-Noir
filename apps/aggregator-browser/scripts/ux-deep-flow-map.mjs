#!/usr/bin/env node
/**
 * Deep live-flow map (Playwright Chromium).
 * Unlock each app, walk major tabs/CTAs, capture API (path/status only), write report.
 *
 *   node scripts/ux-deep-flow-map.mjs
 *   node scripts/ux-deep-flow-map.mjs --only=dashboard,browse
 *
 * Output: .local/ux-playwright/deep-flow-report.json (+ screenshots)
 * No secrets logged. No deletes.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, writeSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  loadTestPn,
  trackOAuth,
  trackApi,
  unlockViaPopup,
  unlockDashboard,
  fillConsentAndUnlock,
} from './ux-unlock-lib.mjs';

function slog(...a) { writeSync(2, a.join(' ') + '\n'); }

const scriptDir = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.REPO_ROOT || resolve(scriptDir, '../../..');
const OUT = resolve(ROOT, '.local/ux-playwright/deep');
mkdirSync(OUT, { recursive: true });
const creds = loadTestPn(ROOT);

const APPS = [
  {
    id: 'dashboard',
    url: process.env.DASHBOARD_URL || 'https://pn.parnoir.com/',
    unlock: 'dashboard',
  },
  {
    id: 'browse',
    url: 'https://browse.parnoir.com/?view=feed',
    unlock: 'popup',
    unlockClick: (page) => page.getByTitle('Unlock pN').first().click(),
  },
  {
    id: 'messaging',
    url: 'https://messaging.parnoir.com/',
    unlock: 'popup',
    unlockClick: async (page) => {
      const byTitle = page.getByTitle('Unlock pN');
      if (await byTitle.first().isVisible().catch(() => false)) {
        await byTitle.first().click();
        return;
      }
      await page.getByRole('button', { name: /Unlock pN/i }).first().click();
    },
  },
  {
    id: 'prism',
    url: 'https://prism.parnoir.com/',
    unlock: 'popup',
    unlockClick: (page) => page.getByTitle('Unlock pN').first().click(),
  },
  {
    id: 'licensing',
    url: 'https://licensing.parnoir.com/',
    unlock: 'popup',
    unlockClick: (page) => page.getByRole('button', { name: /Sign in with pN/i }).first().click(),
  },
  {
    id: 'developer',
    url: 'https://developers.parnoir.com/',
    unlock: 'redirect',
    unlockClick: (page) => page.getByRole('button', { name: /Unlock pN/i }).first().click(),
  },
];

const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const onlyIds = (onlyArg?.slice('--only='.length) || process.env.UX_ONLY || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const RUN = onlyIds.length ? APPS.filter((a) => onlyIds.includes(a.id)) : APPS;

function classifyFromApi(apiSlice, hints = {}) {
  const ok = apiSlice.some((a) => a.status >= 200 && a.status < 400);
  const unpaid = apiSlice.some((a) => a.status === 410);
  if (hints.mock) return 'LIVE_MOCK';
  if (hints.unfinished || unpaid) return 'LIVE_UNFINISHED';
  if (ok || hints.uiOnlyReal) return 'LIVE_REAL';
  if (hints.visible) return 'LIVE_UNFINISHED';
  return 'BLOCKED';
}

async function shot(page, id) {
  const path = resolve(OUT, `${id}.png`);
  await page.screenshot({ path, fullPage: false }).catch(() => {});
  return path;
}

async function clickIfVisible(page, locator, timeout = 5_000) {
  try {
    await locator.first().waitFor({ state: 'visible', timeout });
    await locator.first().click({ timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

async function flowRow(page, apiBag, { app, id, title, sourceHint, action, hints = {} }) {
  const apiBefore = apiBag.length;
  const entry = {
    id: `${app}.${id}`,
    app,
    title,
    sourceHint: sourceHint || null,
    evidence: 'OBSERVED',
    visible: false,
    label: 'BLOCKED',
    api: [],
    notes: [],
    screenshot: null,
  };
  try {
    const ok = await action(page, entry);
    entry.visible = !!ok;
    await page.waitForTimeout(800);
    entry.api = apiBag.slice(apiBefore).slice(-20);
    entry.screenshot = await shot(page, entry.id.replace(/\./g, '-'));
    if (!ok) {
      entry.label = 'BLOCKED';
      entry.notes.push('entry control not found or not clickable');
    } else {
      entry.label = classifyFromApi(entry.api, { ...hints, visible: true });
    }
  } catch (e) {
    entry.label = 'BLOCKED';
    entry.notes.push(String(e?.message || e).slice(0, 240));
    entry.screenshot = await shot(page, entry.id.replace(/\./g, '-') + '-err');
  }
  slog(`  flow ${entry.id} → ${entry.label}`);
  return entry;
}

async function unlockApp(page, app, oauth, notes) {
  if (app.unlock === 'dashboard') {
    await unlockDashboard(page, notes, creds);
    return true;
  }
  if (app.unlock === 'redirect') {
    await app.unlockClick(page);
    await fillConsentAndUnlock(page, { ...creds, expectClose: false });
    await page.waitForURL(/developers\.parnoir\.com/, { timeout: 45_000 }).catch(() => {});
    await page.waitForTimeout(1_500);
    return oauth.token || oauth.authenticate || oauth.userinfo;
  }
  await Promise.race([
    unlockViaPopup(page, app.unlockClick, creds),
    new Promise((_, rej) => setTimeout(() => rej(new Error('popup unlock budget 90s')), 90_000)),
  ]);
  return (
    oauth.token ||
    oauth.userinfo ||
    oauth.authenticate ||
    (await page.getByTitle('Lock pN').first().isVisible().catch(() => false))
  );
}

async function walkDashboard(page, apiBag) {
  const flows = [];
  const tab = async (name, id, sourceHint, hints) =>
    flows.push(
      await flowRow(page, apiBag, {
        app: 'dashboard',
        id,
        title: name,
        sourceHint,
        hints,
        action: async (p) => clickIfVisible(p, p.getByRole('button', { name })),
      })
    );

  flows.push(
    await flowRow(page, apiBag, {
      app: 'dashboard',
      id: 'unlock',
      title: 'Unlock gate cleared',
      sourceHint: 'App/UnlockGate.tsx, hooks/useAuthUnlockHandlers.ts',
      hints: { uiOnlyReal: true },
      action: async (p) => {
        const lock = await p.getByRole('button', { name: /^Lock$/ }).isVisible().catch(() => false);
        const createGone = !(await p.getByRole('button', { name: 'Create New pN' }).isVisible().catch(() => false));
        return lock || createGone;
      },
    })
  );

  await tab('Privacy & Sharing', 'tab.privacy', 'AuthenticatedShell.tsx → PrivacyDataPointsPanel', {
    uiOnlyReal: true,
  });
  flows.push(
    await flowRow(page, apiBag, {
      app: 'dashboard',
      id: 'privacy.verify_open',
      title: 'Verify / identity verification modal (open only)',
      sourceHint: 'IdentityVerificationModal.tsx',
      hints: { unfinished: true },
      action: async (p) =>
        (await clickIfVisible(p, p.getByRole('button', { name: /Verify|Verification/i }))) ||
        (await clickIfVisible(p, p.getByText(/Verify|Veriff|Identity Verification/i))),
    })
  );
  await page.keyboard.press('Escape').catch(() => {});

  await tab('Sub-pN', 'tab.subpn', 'components/subpn/SubPnTab.tsx', { uiOnlyReal: true });
  await tab('Delegation', 'tab.delegation', 'DelegationModal / AuthenticatedShell', { uiOnlyReal: true });
  await tab('Recovery Tool', 'tab.recovery', 'components/recovery/RecoveryTab.tsx', { uiOnlyReal: true });
  await tab('Storage', 'tab.storage', 'components/storage/FileStorageAggregator.tsx', {});
  await tab('Monetization', 'tab.monetization', 'components/monetization/MonetizationTab.tsx', {
    unfinished: true,
  });

  flows.push(
    await flowRow(page, apiBag, {
      app: 'dashboard',
      id: 'export_affordance',
      title: 'Export affordance visible',
      sourceHint: 'ExportAuthModal / Header export',
      hints: { uiOnlyReal: true },
      action: async (p) =>
        (await p.getByRole('button', { name: /Export/i }).first().isVisible().catch(() => false)) ||
        (await p.getByText(/Export/i).first().isVisible().catch(() => false)),
    })
  );

  flows.push(
    await flowRow(page, apiBag, {
      app: 'dashboard',
      id: 'lock_visible',
      title: 'Lock control',
      sourceHint: 'AuthenticatedShell / Header',
      hints: { uiOnlyReal: true },
      action: async (p) => p.getByRole('button', { name: /^Lock$/ }).isVisible().catch(() => false),
    })
  );

  return flows;
}

async function walkBrowse(page, apiBag) {
  const flows = [];
  const rail = async (name) =>
    flows.push(
      await flowRow(page, apiBag, {
        app: 'browse',
        id: `rail.${name.toLowerCase()}`,
        title: `Feed rail ${name}`,
        sourceHint: 'components/FeedRail.tsx',
        hints: { uiOnlyReal: true },
        action: async (p) => clickIfVisible(p, p.getByRole('button', { name })),
      })
    );

  for (const n of ['DISCOVER', 'MEDIA', 'THOUGHTS', 'COLLECTIONS']) await rail(n);

  flows.push(
    await flowRow(page, apiBag, {
      app: 'browse',
      id: 'nav.home',
      title: 'Bottom nav Home',
      sourceHint: 'BottomNav.tsx',
      hints: { uiOnlyReal: true },
      action: async (p) => clickIfVisible(p, p.getByTitle('Home')),
    })
  );
  flows.push(
    await flowRow(page, apiBag, {
      app: 'browse',
      id: 'nav.search',
      title: 'Bottom nav Search',
      sourceHint: 'SearchPage.tsx',
      action: async (p) => clickIfVisible(p, p.getByTitle('Search')),
    })
  );
  flows.push(
    await flowRow(page, apiBag, {
      app: 'browse',
      id: 'nav.upload',
      title: 'Bottom nav Upload (open only)',
      sourceHint: 'UploadPage.tsx / UploadModal.tsx',
      hints: { uiOnlyReal: true },
      action: async (p) => clickIfVisible(p, p.getByTitle('Upload')),
    })
  );
  await page.keyboard.press('Escape').catch(() => {});
  flows.push(
    await flowRow(page, apiBag, {
      app: 'browse',
      id: 'nav.inbox',
      title: 'Bottom nav Inbox',
      sourceHint: 'MessagesPage.tsx / Inbox.tsx',
      action: async (p) => clickIfVisible(p, p.getByTitle('Inbox')),
    })
  );
  flows.push(
    await flowRow(page, apiBag, {
      app: 'browse',
      id: 'nav.me',
      title: 'Bottom nav Me',
      sourceHint: 'MePage.tsx',
      hints: { uiOnlyReal: true },
      action: async (p) =>
        clickIfVisible(p, p.getByTitle('Me')) || clickIfVisible(p, p.getByRole('button', { name: /^Me$/i })),
    })
  );
  flows.push(
    await flowRow(page, apiBag, {
      app: 'browse',
      id: 'engage.sidebar',
      title: 'Engagement sidebar / like affordance',
      sourceHint: 'FeedEngagementSidebar.tsx',
      hints: { uiOnlyReal: true },
      action: async (p) => {
        await clickIfVisible(p, p.getByTitle('Home'));
        await p.waitForTimeout(1000);
        return (
          (await p.getByRole('button', { name: /like|Unlike|❤|♥/i }).first().isVisible().catch(() => false)) ||
          (await p.locator('[aria-label*="like" i], [title*="like" i]').first().isVisible().catch(() => false))
        );
      },
    })
  );
  flows.push(
    await flowRow(page, apiBag, {
      app: 'browse',
      id: 'lock',
      title: 'Lock pN',
      sourceHint: 'LockButtonWithContext.tsx',
      hints: { uiOnlyReal: true },
      action: async (p) => p.getByTitle('Lock pN').first().isVisible().catch(() => false),
    })
  );
  return flows;
}

async function walkMessaging(page, apiBag) {
  const flows = [];
  const tab = async (name, id, sourceHint) =>
    flows.push(
      await flowRow(page, apiBag, {
        app: 'messaging',
        id,
        title: name,
        sourceHint,
        action: async (p) => clickIfVisible(p, p.getByRole('button', { name })),
      })
    );

  await tab('Messages', 'tab.messages', 'Inbox.tsx / MessageList.tsx');
  await tab('Notifications', 'tab.notifications', 'NotificationList.tsx');
  await tab('Requests', 'tab.requests', 'RequestsList.tsx');
  flows.push(
    await flowRow(page, apiBag, {
      app: 'messaging',
      id: 'tab.connections',
      title: 'Connections',
      sourceHint: 'ConnectionsPanel.tsx',
      action: async (p) =>
        clickIfVisible(p, p.getByRole('button', { name: /Connections|Followers|Following/i })) ||
        clickIfVisible(p, p.getByTitle(/Connections/i)),
    })
  );
  flows.push(
    await flowRow(page, apiBag, {
      app: 'messaging',
      id: 'group_create_open',
      title: 'New group modal (open only)',
      sourceHint: 'CreateGroupModal.tsx',
      hints: { uiOnlyReal: true },
      action: async (p) =>
        clickIfVisible(p, p.getByRole('button', { name: /New group|Create group/i })),
    })
  );
  await page.keyboard.press('Escape').catch(() => {});
  flows.push(
    await flowRow(page, apiBag, {
      app: 'messaging',
      id: 'lock',
      title: 'Lock pN',
      sourceHint: 'LockButtonWithContext.tsx',
      hints: { uiOnlyReal: true },
      action: async (p) => p.getByTitle('Lock pN').first().isVisible().catch(() => false),
    })
  );
  return flows;
}

async function walkPrism(page, apiBag) {
  const flows = [];
  flows.push(
    await flowRow(page, apiBag, {
      app: 'prism',
      id: 'shell',
      title: 'Prism shell after unlock',
      sourceHint: 'apps/prism/src/App.tsx',
      hints: { uiOnlyReal: true },
      action: async (p) => /Prism|Ray|Auditor|Queue/i.test(await p.locator('body').innerText().catch(() => '')),
    })
  );
  flows.push(
    await flowRow(page, apiBag, {
      app: 'prism',
      id: 'apply',
      title: 'Apply / Ray application CTA',
      sourceHint: 'useRayApply.ts',
      hints: { unfinished: true },
      action: async (p) => p.getByRole('button', { name: /Apply/i }).first().isVisible().catch(() => false),
    })
  );
  flows.push(
    await flowRow(page, apiBag, {
      app: 'prism',
      id: 'queue',
      title: 'Queue / Approve / Deny chrome or empty',
      sourceHint: 'RayView.tsx',
      action: async (p) => {
        const body = await p.locator('body').innerText().catch(() => '');
        const empty = /empty|no (items|content|rays)|queue/i.test(body);
        const actions =
          (await p.getByRole('button', { name: /Approve|Deny|Skip|Refresh/i }).first().isVisible().catch(() => false));
        return empty || actions;
      },
    })
  );
  flows.push(
    await flowRow(page, apiBag, {
      app: 'prism',
      id: 'admin_seed',
      title: 'Admin seed demo (if visible)',
      sourceHint: 'App.tsx seedDemoQueue',
      hints: { unfinished: true },
      action: async (p) => p.getByRole('button', { name: /Seed|Admin/i }).first().isVisible().catch(() => false),
    })
  );
  return flows;
}

async function walkLicensing(page, apiBag) {
  const flows = [];
  flows.push(
    await flowRow(page, apiBag, {
      app: 'licensing',
      id: 'shell',
      title: 'Licensing shell after unlock',
      sourceHint: 'apps/licensing-portal/src/App.tsx',
      hints: { uiOnlyReal: true },
      action: async (p) =>
        !(await p.getByRole('button', { name: /Sign in with pN/i }).first().isVisible().catch(() => false)),
    })
  );
  flows.push(
    await flowRow(page, apiBag, {
      app: 'licensing',
      id: 'tracks',
      title: 'Track library / Add track',
      sourceHint: 'TrackLibraryPanel.tsx',
      action: async (p) =>
        clickIfVisible(p, p.getByRole('button', { name: /Add track|Add Track/i })) ||
        /track|library|split/i.test(await p.locator('body').innerText().catch(() => '')),
    })
  );
  await page.keyboard.press('Escape').catch(() => {});
  flows.push(
    await flowRow(page, apiBag, {
      app: 'licensing',
      id: 'partner_mailto',
      title: 'Partner inquiry',
      sourceHint: 'App.tsx mailto',
      hints: { uiOnlyReal: true },
      action: async (p) =>
        (await p.getByRole('link', { name: /partner|contact|inquiry/i }).first().isVisible().catch(() => false)) ||
        (await p.getByRole('button', { name: /partner|contact|inquiry|Submit/i }).first().isVisible().catch(() => false)),
    })
  );
  return flows;
}

async function walkDeveloper(page, apiBag) {
  const flows = [];
  const nav = [
    ['Home', 'nav.home', '/'],
    ['Credentials', 'nav.credentials', '/credentials'],
    ['Data points', 'nav.data_points', '/data-points'],
    ['Guides', 'nav.guides', '/docs'],
    ['Layer 5', 'nav.layer5', '/integrate'],
    ['API reference', 'nav.api_reference', '/api-reference'],
    ['Proposals', 'nav.proposals', '/proposals'],
  ];
  for (const [name, id, pathHint] of nav) {
    flows.push(
      await flowRow(page, apiBag, {
        app: 'developer',
        id,
        title: `Nav ${name}`,
        sourceHint: `developer-portal route ${pathHint}`,
        hints: { uiOnlyReal: true },
        action: async (p) => {
          const byRole = await clickIfVisible(p, p.getByRole('link', { name: new RegExp(`^${name}$`, 'i') }));
          if (byRole) return true;
          const href = pathHint === '/' ? '/' : pathHint;
          if (await clickIfVisible(p, p.locator(`a[href="${href}"], a[href="${href}/"]`))) return true;
          await p.goto(`https://developers.parnoir.com${href === '/' ? '' : href}`, {
            waitUntil: 'domcontentloaded',
            timeout: 30_000,
          });
          return p.url().includes(href === '/' ? 'developers.parnoir.com' : href);
        },
      })
    );
  }
  flows.push(
    await flowRow(page, apiBag, {
      app: 'developer',
      id: 'platform_gate',
      title: 'Platform operator routes (if gated open)',
      sourceHint: 'PlatformOperatorGate.tsx',
      hints: { unfinished: true },
      action: async (p) =>
        clickIfVisible(p, p.getByRole('link', { name: /Platform|Overview|Applications/i })),
    })
  );
  flows.push(
    await flowRow(page, apiBag, {
      app: 'developer',
      id: 'identity_sdk_note',
      title: 'Session stack note (identity-sdk)',
      sourceHint: 'PortalContext.tsx → @identity-protocol/identity-sdk',
      hints: { unfinished: true },
      action: async () => true,
    })
  );
  // Force label for SDK note
  const last = flows[flows.length - 1];
  last.label = 'NEEDS_USER_REVIEW';
  last.notes.push('Unlock REAL via OAuth; PortalContext still depends on identity-sdk → identity-core');
  last.evidence = 'INFERRED';
  return flows;
}

async function runApp(browser, app) {
  const notes = [];
  const oauth = { challenge: false, authenticate: false, token: false, userinfo: false };
  const apiBag = [];
  const result = {
    app: app.id,
    url: app.url,
    unlocked: false,
    oauth,
    flows: [],
    notes,
    blocked: null,
  };

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  trackOAuth(page, oauth);
  trackApi(page, apiBag);

  try {
    await page.goto(app.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    slog(`RUN ${app.id} unlock...`);
    result.unlocked = !!(await unlockApp(page, app, oauth, notes));
    slog(`  unlocked=${result.unlocked}`);
    if (!result.unlocked) {
      result.blocked = 'unlock failed';
      result.flows.push({
        id: `${app.id}.unlock`,
        app: app.id,
        title: 'Unlock',
        label: 'BLOCKED',
        evidence: 'OBSERVED',
        notes: [...notes],
      });
      return result;
    }

    try {
      if (app.id === 'dashboard') result.flows = await walkDashboard(page, apiBag);
      else if (app.id === 'browse') result.flows = await walkBrowse(page, apiBag);
      else if (app.id === 'messaging') result.flows = await walkMessaging(page, apiBag);
      else if (app.id === 'prism') result.flows = await walkPrism(page, apiBag);
      else if (app.id === 'licensing') result.flows = await walkLicensing(page, apiBag);
      else if (app.id === 'developer') result.flows = await walkDeveloper(page, apiBag);
      slog('walked', app.id, 'flows', result.flows.length);
    } catch (we) {
      result.blocked = 'walk: ' + String(we?.message || we).slice(0, 400);
      notes.push(result.blocked);
      slog('WALK_ERR', app.id, result.blocked);
    }
  } catch (e) {
    result.blocked = String(e?.message || e).slice(0, 400);
    notes.push(result.blocked);
    slog('RUN_ERR', app.id, result.blocked);
  } finally {
    await context.close().catch(() => {});
  }
  return result;
}

const browser = await chromium.launch({ headless: true });
const report = {
  generatedAt: new Date().toISOString(),
  tool: 'playwright-chromium-deep-flow',
  apps: [],
};

const outPath = resolve(ROOT, '.local/ux-playwright/deep-flow-report.json');
for (const app of RUN) {
  report.apps.push(await runApp(browser, app));
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  slog('WROTE', outPath, 'apps=', report.apps.length);
}
await browser.close();
const summary = report.apps.map((a) => ({
  app: a.app,
  unlocked: a.unlocked,
  flows: a.flows.map((f) => ({ id: f.id, label: f.label })),
}));
console.log(JSON.stringify({ outPath, summary }, null, 2));
