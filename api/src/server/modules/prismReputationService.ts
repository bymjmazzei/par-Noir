/**
 * Prism Reputation Service
 * Activity-based reputation score (0-100) for Ray application validation.
 * Tracks: activity volume, content creation, account tenure, report accuracy, Ray vote performance.
 */

import { getDatabasePool } from '../utils/database';

const MIN_REPUTATION_SCORE = parseInt(process.env.PRISM_MIN_REPUTATION_SCORE || '50', 10);
const REPUTATION_WEIGHTS = {
  activityVolume: 0.2,
  contentCreation: 0.2,
  accountTenure: 0.2,
  reportAccuracy: 0.2,
  rayPerformance: 0.2,
};

export interface ReputationBreakdown {
  activityVolume: { score: number; engagementCount: number; flaggedPenalty: number };
  contentCreation: { score: number; publicFileCount: number; deniedPenalty: number };
  accountTenure: { score: number; daysSinceCreation: number };
  reportAccuracy: { score: number; upheld: number; falseReports: number; total: number };
  rayPerformance: { score: number; matched: number; broke: number; total: number };
}

export interface ReputationResult {
  score: number;
  breakdown: ReputationBreakdown;
  eligible: boolean;
  /** Attestations (identity, payment) require Drive access; checked at application time. Stub for now. */
  hasRequiredAttestations: boolean | null;
}

function normalizePnIdentifier(pn: string): string {
  return pn.startsWith('pn-') ? pn : `pn-${pn}`;
}

/**
 * Get reputation score for a user
 */
export async function getReputationScore(pnIdentifier: string): Promise<ReputationResult> {
  const db = getDatabasePool();
  const pn = normalizePnIdentifier(pnIdentifier);

  const [
    engagementCount,
    flaggedContentCount,
    publicFileCount,
    deniedContentCount,
    accountCreatedAt,
    reportStats,
    rayStats,
  ] = await Promise.all([
    getEngagementCount(db, pn),
    getFlaggedContentCount(db, pn),
    getPublicFileCount(db, pn),
    getDeniedContentCount(db, pn),
    getAccountCreatedAt(db, pn),
    getReportAccuracy(db, pn),
    getRayVotePerformance(db, pn),
  ]);

  const activityScore = computeActivityScore(engagementCount, flaggedContentCount);
  const contentScore = computeContentScore(publicFileCount, deniedContentCount);
  const tenureScore = computeTenureScore(accountCreatedAt);
  const reportScore = computeReportScore(reportStats);
  const rayScore = computeRayScore(rayStats);

  const breakdown: ReputationBreakdown = {
    activityVolume: {
      score: activityScore,
      engagementCount,
      flaggedPenalty: flaggedContentCount,
    },
    contentCreation: {
      score: contentScore,
      publicFileCount,
      deniedPenalty: deniedContentCount,
    },
    accountTenure: {
      score: tenureScore,
      daysSinceCreation: accountCreatedAt
        ? Math.floor((Date.now() - new Date(accountCreatedAt).getTime()) / 86400000)
        : 0,
    },
    reportAccuracy: {
      score: reportScore,
      upheld: reportStats.upheld,
      falseReports: reportStats.falseReports,
      total: reportStats.total,
    },
    rayPerformance: {
      score: rayScore,
      matched: rayStats.matched,
      broke: rayStats.broke,
      total: rayStats.total,
    },
  };

  const score =
    activityScore * REPUTATION_WEIGHTS.activityVolume +
    contentScore * REPUTATION_WEIGHTS.contentCreation +
    tenureScore * REPUTATION_WEIGHTS.accountTenure +
    reportScore * REPUTATION_WEIGHTS.reportAccuracy +
    rayScore * REPUTATION_WEIGHTS.rayPerformance;

  const finalScore = Math.round(Math.min(100, Math.max(0, score)));
  const eligible = finalScore >= MIN_REPUTATION_SCORE;

  return {
    score: finalScore,
    breakdown,
    eligible,
    hasRequiredAttestations: null, // Stub: checked at application time when user has Drive token
  };
}

async function getEngagementCount(db: ReturnType<typeof getDatabasePool>, pn: string): Promise<number> {
  const r = await db.query(
    `SELECT COUNT(*)::int as count FROM engagement WHERE user_did = $1`,
    [pn]
  );
  return parseInt(String((r.rows[0] as { count?: string })?.count ?? '0'), 10);
}

async function getFlaggedContentCount(
  db: ReturnType<typeof getDatabasePool>,
  pn: string
): Promise<number> {
  const r = await db.query(
    `SELECT COUNT(*)::int as count FROM prism_review_queue WHERE owner_pn_identifier = $1`,
    [pn]
  );
  return parseInt(String((r.rows[0] as { count?: string })?.count ?? '0'), 10);
}

async function getPublicFileCount(db: ReturnType<typeof getDatabasePool>, pn: string): Promise<number> {
  const [m, t, c] = await Promise.all([
    db.query(
      `SELECT COUNT(*)::int as count FROM aggregator_media WHERE pn_identifier = $1 AND (metadata->>'isPublic')::text = 'true'`,
      [pn]
    ),
    db.query(
      `SELECT COUNT(*)::int as count FROM aggregator_thoughts WHERE pn_identifier = $1 AND (metadata->>'isPublic')::text = 'true'`,
      [pn]
    ),
    db.query(
      `SELECT COUNT(*)::int as count FROM aggregator_collections WHERE pn_identifier = $1 AND (metadata->>'isPublic')::text = 'true'`,
      [pn]
    ),
  ]);
  const count = (row: { count?: string } | undefined) => parseInt(String(row?.count ?? '0'), 10);
  return count(m.rows[0] as { count?: string }) + count(t.rows[0] as { count?: string }) + count(c.rows[0] as { count?: string });
}

async function getDeniedContentCount(
  db: ReturnType<typeof getDatabasePool>,
  pn: string
): Promise<number> {
  const r = await db.query(
    `SELECT COUNT(*)::int as count FROM prism_review_queue WHERE owner_pn_identifier = $1 AND status = 'denied'`,
    [pn]
  );
  return parseInt(String((r.rows[0] as { count?: string })?.count ?? '0'), 10);
}

async function getAccountCreatedAt(
  db: ReturnType<typeof getDatabasePool>,
  pn: string
): Promise<string | null> {
  const r = await db.query(
    `SELECT created_at FROM storage_credentials WHERE identity_id = $1`,
    [pn]
  );
  return (r.rows[0] as { created_at?: string | null })?.created_at ?? null;
}

async function getReportAccuracy(
  db: ReturnType<typeof getDatabasePool>,
  pn: string
): Promise<{ upheld: number; falseReports: number; total: number }> {
  const r = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'denied')::int as upheld,
       COUNT(*) FILTER (WHERE status = 'approved')::int as false_reports,
       COUNT(*)::int as total
     FROM prism_review_queue
     WHERE reporter_pn_identifier = $1 AND flag_source = 'user_report' AND status IN ('approved', 'denied')`,
    [pn]
  );
  const row = r.rows[0] as { upheld?: string; false_reports?: string; total?: string } | undefined;
  const upheld = parseInt(String(row?.upheld ?? '0'), 10);
  const falseReports = parseInt(String(row?.false_reports ?? '0'), 10);
  const total = parseInt(String(row?.total ?? '0'), 10);
  return { upheld, falseReports, total };
}

async function getRayVotePerformance(
  db: ReturnType<typeof getDatabasePool>,
  pn: string
): Promise<{ matched: number; broke: number; total: number }> {
  const r = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE (v.vote = 'approve' AND q.status = 'approved') OR (v.vote = 'deny' AND q.status = 'denied'))::int as matched,
       COUNT(*) FILTER (WHERE (v.vote = 'approve' AND q.status = 'denied') OR (v.vote = 'deny' AND q.status = 'approved'))::int as broke,
       COUNT(*)::int as total
     FROM prism_votes v
     JOIN prism_review_queue q ON q.id = v.queue_item_id
     WHERE v.ray_pn_identifier = $1 AND q.status IN ('approved', 'denied')`,
    [pn]
  );
  const row = r.rows[0] as { matched?: string; broke?: string; total?: string } | undefined;
  const matched = parseInt(String(row?.matched ?? '0'), 10);
  const broke = parseInt(String(row?.broke ?? '0'), 10);
  const total = parseInt(String(row?.total ?? '0'), 10);
  return { matched, broke, total };
}

function computeActivityScore(engagementCount: number, flaggedCount: number): number {
  const base = Math.min(100, engagementCount * 2);
  const penalty = flaggedCount * 15;
  return Math.max(0, base - penalty);
}

function computeContentScore(publicCount: number, deniedCount: number): number {
  const base = Math.min(100, publicCount * 5);
  const penalty = deniedCount * 25;
  return Math.max(0, base - penalty);
}

function computeTenureScore(createdAt: string | null): number {
  if (!createdAt) return 0;
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
  if (days < 7) return 20;
  if (days < 30) return 50;
  if (days < 90) return 75;
  return 100;
}

function computeReportScore(stats: { upheld: number; falseReports: number; total: number }): number {
  if (stats.total === 0) return 50; // Neutral
  const ratio = stats.upheld / stats.total;
  const falsePenalty = stats.falseReports * 30;
  const base = ratio * 100;
  return Math.max(0, Math.min(100, base - falsePenalty));
}

function computeRayScore(stats: { matched: number; broke: number; total: number }): number {
  if (stats.total === 0) return 50; // Neutral
  const ratio = stats.matched / stats.total;
  const brokePenalty = stats.broke * 25;
  const base = ratio * 100;
  return Math.max(0, Math.min(100, base - brokePenalty));
}

/**
 * Submit a Ray application. Records in prism_ray_applications.
 * Returns { applied: true } if new application, { applied: false, reason } if ineligible or already applied.
 */
export async function submitRayApplication(pnIdentifier: string): Promise<
  | { applied: true; applicationId: string }
  | { applied: false; reason: 'ineligible' | 'already_applied' }
> {
  const db = getDatabasePool();
  const pn = normalizePnIdentifier(pnIdentifier);

  const reputation = await getReputationScore(pnIdentifier);
  if (!reputation.eligible) {
    return { applied: false, reason: 'ineligible' };
  }

  const existing = await db.query(
    `SELECT id, status FROM prism_ray_applications WHERE pn_identifier = $1`,
    [pn]
  );
  if (existing.rows.length > 0) {
    return { applied: false, reason: 'already_applied' };
  }

  const result = await db.query(
    `INSERT INTO prism_ray_applications (pn_identifier, status, metadata)
     VALUES ($1, 'pending', $2::jsonb)
     RETURNING id`,
    [pn, JSON.stringify({ scoreAtApply: reputation.score, appliedAt: new Date().toISOString() })]
  );
  const id = (result.rows[0] as { id: string })?.id;
  return id ? { applied: true, applicationId: id } : { applied: false, reason: 'ineligible' };
}
