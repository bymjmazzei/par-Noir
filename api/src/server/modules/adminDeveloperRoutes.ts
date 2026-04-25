/**
 * Admin-only routes for OAuth client registration and API key issuance.
 * Requires ADMIN_API_KEY in env (X-Admin-Key header, or Authorization: Bearer <same value>).
 * In production, missing ADMIN_API_KEY rejects admin routes.
 */

import type { Application, Request, Response, NextFunction } from 'express';
import { ApiKeyService } from './apiKeyService';
import { safeClientErrorMessage } from '../utils/safeError';
import { registerSuccession } from './identitySuccessionService';
import { appendAuditEvent } from './auditService';
import { securityFlags, isProduction } from '../utils/securityFlags';
import { appendSecurityAuditEvent } from './auditService';
import { hashIdentifier, safeLogger } from '../../utils/logger';

const NODE_ENV = process.env.NODE_ENV || 'development';

type KpiDefinition = {
  id: string;
  label: string;
  owner: string;
  formula: string;
  source: string[];
  freshnessSlaSec: number;
  thresholds: {
    goodGte?: number;
    warnGte?: number;
    badLt?: number;
  };
  decisionPlaybook: string;
};

const KPI_REGISTRY: KpiDefinition[] = [
  {
    id: 'funnel_identity_to_verified',
    label: 'Identity -> Verified Conversion',
    owner: 'growth',
    formula: 'verified_users / total_users',
    source: ['user_profiles', 'verified_identities'],
    freshnessSlaSec: 300,
    thresholds: { goodGte: 0.7, warnGte: 0.4, badLt: 0.4 },
    decisionPlaybook: 'If < 40%, inspect verification friction and drop-offs.',
  },
  {
    id: 'verified_engagement_share',
    label: 'Verified Engagement Share',
    owner: 'trust',
    formula: 'verified_engagement / total_engagement',
    source: ['engagement'],
    freshnessSlaSec: 300,
    thresholds: { goodGte: 0.5, warnGte: 0.3, badLt: 0.3 },
    decisionPlaybook: 'If < 30%, tighten anti-bot and improve verified adoption.',
  },
  {
    id: 'api_success_rate',
    label: 'API Success Rate (24h admin probes)',
    owner: 'platform',
    formula: '1 - (failed_admin_events / total_admin_events)',
    source: ['audit_events'],
    freshnessSlaSec: 60,
    thresholds: { goodGte: 0.98, warnGte: 0.95, badLt: 0.95 },
    decisionPlaybook: 'If < 95%, trigger incident review and endpoint triage.',
  },
  {
    id: 'payout_hold_ratio',
    label: 'Payout Hold Ratio',
    owner: 'economics',
    formula: 'payout_in_hold_cents / max(total_available_plus_hold,1)',
    source: ['creator_fund_balances', 'creator_fund_payout_requests'],
    freshnessSlaSec: 300,
    thresholds: { goodGte: 0, warnGte: 0, badLt: 0 },
    decisionPlaybook: 'If rising > 25%, investigate payout bottlenecks and compliance holds.',
  },
];

function toneFromThresholds(value: number, thresholds: KpiDefinition['thresholds']): 'ok' | 'warn' | 'bad' | 'neutral' {
  if (thresholds.goodGte != null && value >= thresholds.goodGte) return 'ok';
  if (thresholds.warnGte != null && value >= thresholds.warnGte) return 'warn';
  if (thresholds.badLt != null && value < thresholds.badLt) return 'bad';
  return 'neutral';
}

function pct(num: number, den: number): number {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return 0;
  return Number((num / den).toFixed(4));
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export function requireAdminApiKey(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.ADMIN_API_KEY?.trim();
  const allowedPrincipals = (process.env.ADMIN_ALLOWED_PRINCIPALS || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  const assertedPrincipal =
    (req.headers['x-admin-principal'] as string) ||
    (req.headers['x-goog-authenticated-user-email'] as string) ||
    '';

  if (securityFlags.enableAdminIdentityHeaders && assertedPrincipal && allowedPrincipals.includes(assertedPrincipal)) {
    return next();
  }

  if (!expected) {
    if (NODE_ENV === 'production' || securityFlags.disableLegacyAdminApiKey) {
      res.status(503).json({
        error: 'service_unavailable',
        error_description: 'Admin operations are not configured'
      });
      return;
    }
    if (!securityFlags.allowUnsafeDevAdminBypass) {
      res.status(503).json({
        error: 'service_unavailable',
        error_description: 'Admin bypass disabled; set ALLOW_UNSAFE_DEV_ADMIN_BYPASS=true for local dev only',
      });
      return;
    }
    safeLogger.warn('[admin] ADMIN_API_KEY unset — allowing admin route in non-production due to explicit bypass flag');
    next();
    return;
  }

  let provided = (req.headers['x-admin-key'] as string) || '';
  const auth = req.headers.authorization;
  if (!provided && auth?.startsWith('Bearer ')) {
    provided = auth.slice(7).trim();
  }

  if (provided !== expected) {
    void appendSecurityAuditEvent({
      eventType: 'admin.auth.failed',
      severity: isProduction() ? 'high' : 'medium',
      actorHint: 'admin',
      metadata: {
        principalHash: hashIdentifier(assertedPrincipal || 'missing'),
        source: securityFlags.enableAdminIdentityHeaders ? 'identity_headers_or_legacy' : 'legacy_admin_key',
      },
    });
    res.status(401).json({
      error: 'unauthorized',
      error_description: 'Invalid or missing admin key (use X-Admin-Key or Authorization: Bearer)'
    });
    return;
  }

  next();
}

export function registerAdminDeveloperRoutes(app: Application): void {
  app.post('/api/admin/api-keys', requireAdminApiKey, async (req: Request, res: Response) => {
    try {
      const { pnId, ownerType, scopes, isActive, requestsPerMinute, requestsPerDay } = req.body || {};
      if (!pnId || typeof pnId !== 'string') {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'pnId is required'
        });
      }

      const { record, plaintextKey } = await ApiKeyService.createApiKey({
        pnId: pnId.trim(),
        ownerType: typeof ownerType === 'string' ? ownerType : undefined,
        scopes: Array.isArray(scopes) ? scopes.map(String) : undefined,
        isActive: isActive !== false,
        requestsPerMinute: typeof requestsPerMinute === 'number' ? requestsPerMinute : undefined,
        requestsPerDay: typeof requestsPerDay === 'number' ? requestsPerDay : undefined
      });

      return res.status(201).json({
        id: record.id,
        pnId: record.pnId,
        ownerType: record.ownerType,
        scopes: record.scopes,
        apiKey: plaintextKey,
        message: 'Store this API key securely; it will not be shown again.'
      });
    } catch (error: unknown) {
      console.error('[admin] create api key:', error);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to create API key'
      });
    }
  });

  /**
   * POST /api/admin/identity/succession
   * Register predecessor → successor for par Noir network (OAuth, storage, feeds binding).
   * Requires ADMIN_API_KEY. Run from secure automation after recovery / rotation workflows.
   */
  app.post('/api/admin/identity/succession', requireAdminApiKey, async (req: Request, res: Response) => {
    try {
      const {
        predecessorPnIdentifier,
        successorPnIdentifier,
        predecessorDid,
        successorDid,
        migrationId,
        reason,
        migrateBindings
      } = req.body || {};

      if (!predecessorPnIdentifier || !successorPnIdentifier) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'predecessorPnIdentifier and successorPnIdentifier are required'
        });
      }

      await registerSuccession({
        predecessorPnIdentifier: String(predecessorPnIdentifier),
        successorPnIdentifier: String(successorPnIdentifier),
        predecessorDid: typeof predecessorDid === 'string' ? predecessorDid : undefined,
        successorDid: typeof successorDid === 'string' ? successorDid : undefined,
        migrationId: typeof migrationId === 'string' ? migrationId : undefined,
        reason: typeof reason === 'string' ? reason : undefined,
        migrateBindings: migrateBindings !== false
      });

      await appendAuditEvent({
        eventType: 'identity.succession.registered',
        actorHint: 'admin',
        subjectPnIdentifier: String(predecessorPnIdentifier),
        metadata: { successorPnIdentifier: String(successorPnIdentifier) }
      });

      return res.status(201).json({ success: true });
    } catch (error: unknown) {
      const err = error as Error & { code?: string };
      if (err.code === 'INVALID_SUCCESSION') {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: err.message
        });
      }
      if ((error as { code?: string }).code === '23505') {
        return res.status(409).json({
          error: 'conflict',
          error_description: 'Succession already recorded for this predecessor'
        });
      }
      console.error('[admin] identity succession:', error);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to register succession'
      });
    }
  });

  app.get('/api/admin/audit-events', requireAdminApiKey, async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit || '200'), 10) || 200, 2000);
      const eventType = req.query.event_type ? String(req.query.event_type) : null;
      const { getDatabasePool } = await import('../utils/database');
      const db = getDatabasePool();
      const r = eventType
        ? await db.query(
            `SELECT id, event_type, actor_hint, subject_pn_identifier, metadata, created_at
             FROM audit_events WHERE event_type = $1 ORDER BY created_at DESC LIMIT $2`,
            [eventType, limit]
          )
        : await db.query(
            `SELECT id, event_type, actor_hint, subject_pn_identifier, metadata, created_at
             FROM audit_events ORDER BY created_at DESC LIMIT $1`,
            [limit]
          );
      return res.json({ events: r.rows });
    } catch (error: unknown) {
      console.error('[admin] audit-events:', error);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to list audit events'
      });
    }
  });

  app.get('/api/admin/social/metrics', requireAdminApiKey, async (_req: Request, res: Response) => {
    try {
      const { getDatabasePool } = await import('../utils/database');
      const db = getDatabasePool();

      const [usersRes, postsRes, engagementRes] = await Promise.all([
        db.query(`
          SELECT
            COUNT(*)::bigint AS total_users,
            (
              SELECT COUNT(*)::bigint
              FROM user_profiles up
              WHERE EXISTS (
                SELECT 1
                FROM verified_identities vi
                WHERE vi.identity_id = up.pn_identifier
                  AND vi.is_active = TRUE
              )
            ) AS verified_users
          FROM user_profiles
        `),
        db.query(`
          SELECT
            COUNT(*)::bigint AS total_posts,
            COUNT(*) FILTER (WHERE COALESCE(NULLIF(TRIM(content), ''), '') <> '')::bigint AS text_posts,
            COUNT(*) FILTER (
              WHERE CASE WHEN jsonb_typeof(media) = 'array' THEN jsonb_array_length(media) ELSE 0 END > 0
            )::bigint AS media_posts,
            COUNT(*) FILTER (
              WHERE CASE WHEN jsonb_typeof(polls) = 'array' THEN jsonb_array_length(polls) ELSE 0 END > 0
            )::bigint AS poll_posts,
            COUNT(*) FILTER (
              WHERE CASE WHEN jsonb_typeof(forms) = 'array' THEN jsonb_array_length(forms) ELSE 0 END > 0
            )::bigint AS form_posts,
            COUNT(*) FILTER (WHERE is_top_post = TRUE)::bigint AS top_posts,
            COUNT(*) FILTER (WHERE file_id IS NOT NULL)::bigint AS file_linked_posts
          FROM feed_posts
        `),
        db.query(`
          SELECT
            COALESCE(SUM(COALESCE((metadata->'engagement'->>'views')::bigint, 0)), 0)::bigint AS total_views,
            COALESCE(SUM(COALESCE((metadata->'engagement'->>'likes')::bigint, 0)), 0)::bigint AS total_likes,
            COALESCE(SUM(COALESCE((metadata->'engagement'->>'comments')::bigint, 0)), 0)::bigint AS total_comments,
            COALESCE(SUM(COALESCE((metadata->'engagement'->>'shares')::bigint, 0)), 0)::bigint AS total_shares
          FROM (
            SELECT metadata FROM aggregator_media
            UNION ALL
            SELECT metadata FROM aggregator_thoughts
            UNION ALL
            SELECT metadata FROM aggregator_collections
          ) AS all_content
        `),
      ]);

      const usersRow = usersRes.rows[0] || {};
      const postsRow = postsRes.rows[0] || {};
      const engagementRow = engagementRes.rows[0] || {};

      const totalUsers = Number(usersRow.total_users ?? 0);
      const verifiedUsers = Number(usersRow.verified_users ?? 0);
      const unverifiedUsers = Math.max(0, totalUsers - verifiedUsers);

      return res.json({
        generatedAt: new Date().toISOString(),
        totals: {
          users: {
            total: totalUsers,
            verified: verifiedUsers,
            unverified: unverifiedUsers,
          },
          posts: {
            total: Number(postsRow.total_posts ?? 0),
            byType: {
              text: Number(postsRow.text_posts ?? 0),
              media: Number(postsRow.media_posts ?? 0),
              poll: Number(postsRow.poll_posts ?? 0),
              form: Number(postsRow.form_posts ?? 0),
              top: Number(postsRow.top_posts ?? 0),
              fileLinked: Number(postsRow.file_linked_posts ?? 0),
            },
          },
          engagement: {
            views: Number(engagementRow.total_views ?? 0),
            likes: Number(engagementRow.total_likes ?? 0),
            comments: Number(engagementRow.total_comments ?? 0),
            shares: Number(engagementRow.total_shares ?? 0),
          },
        },
      });
    } catch (error: unknown) {
      console.error('[admin] social metrics:', error);
      return res.status(500).json({
        error: 'server_error',
        error_description:
          safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to load social metrics',
      });
    }
  });

  app.get('/api/admin/dashboard/v2', requireAdminApiKey, async (_req: Request, res: Response) => {
    try {
      const { getDatabasePool } = await import('../utils/database');
      const db = getDatabasePool();

      const generatedAt = new Date().toISOString();
      const notes: string[] = [];
      const missingMetrics: string[] = [];
      const missingEndpoints: string[] = [];

      const [
        usersRes,
        verifiedRes,
        storageConnectedRes,
        postsRes,
        firstEngagersRes,
        monetizedRes,
        payoutEligibleRes,
        engagementMixRes,
        uniqueEngagersRes,
        topCreatorRes,
        anomaliesRes,
        allocationsRes,
        volatilityRes,
        payoutRes,
        reliabilityRes,
        cohortRes,
      ] = await Promise.all([
        db.query(`SELECT COUNT(*)::bigint AS total_users FROM user_profiles`),
        db.query(`SELECT COUNT(DISTINCT identity_id)::bigint AS verified_users FROM verified_identities WHERE is_active = TRUE`),
        db.query(`SELECT COUNT(DISTINCT pn_identifier)::bigint AS connected_users FROM oauth_refresh_tokens WHERE pn_identifier IS NOT NULL`),
        db.query(`SELECT COUNT(*)::bigint AS total_posts FROM feed_posts`),
        db.query(`SELECT COUNT(DISTINCT user_did)::bigint AS first_engagers FROM engagement`),
        db.query(`SELECT COUNT(*)::bigint AS monetized_users FROM monetization_subscriptions WHERE status = 'active'`),
        db.query(`SELECT COUNT(*)::bigint AS payout_eligible_users FROM creator_fund_balances WHERE balance_cents > 0`),
        db.query(`
          SELECT
            COUNT(*)::bigint AS total,
            COUNT(*) FILTER (WHERE COALESCE(is_verified, FALSE) = TRUE)::bigint AS verified_total,
            COUNT(*) FILTER (WHERE COALESCE(bot_score, 0) >= 0.75)::bigint AS suspicious_total
          FROM engagement
        `),
        db.query(`
          SELECT
            COUNT(DISTINCT user_did)::bigint AS unique_engagers,
            COUNT(*)::bigint AS total_events
          FROM engagement
        `),
        db.query(`
          WITH per_creator AS (
            SELECT
              COALESCE(pn_identifier, 'unknown') AS creator_id,
              SUM(COALESCE((metadata->'engagement'->>'views')::bigint, 0))::bigint AS views
            FROM (
              SELECT pn_identifier, metadata FROM aggregator_media
              UNION ALL
              SELECT pn_identifier, metadata FROM aggregator_thoughts
              UNION ALL
              SELECT pn_identifier, metadata FROM aggregator_collections
            ) all_content
            GROUP BY COALESCE(pn_identifier, 'unknown')
          )
          SELECT
            COALESCE(SUM(views), 0)::bigint AS total_views,
            COALESCE((SELECT MAX(views) FROM per_creator), 0)::bigint AS max_creator_views
          FROM per_creator
        `),
        db.query(`SELECT COUNT(*)::bigint AS anomalies_24h FROM audit_events WHERE created_at > NOW() - INTERVAL '24 hours'`),
        db.query(`SELECT allocation_cents::bigint AS allocation_cents FROM creator_fund_period_creator_allocations`),
        db.query(`
          SELECT
            COALESCE(STDDEV_POP(r_cents), 0)::float8 AS net_volatility
          FROM creator_fund_periods
          WHERE status = 'closed'
            AND period_end > NOW() - INTERVAL '30 days'
        `),
        db.query(`
          SELECT
            COALESCE(SUM(CASE WHEN status = 'processing' THEN amount_cents ELSE 0 END), 0)::bigint AS in_hold,
            COALESCE(SUM(CASE WHEN status = 'paid' THEN amount_cents ELSE 0 END), 0)::bigint AS paid
          FROM creator_fund_payout_requests
        `),
        db.query(`
          SELECT
            COUNT(*)::bigint AS events_24h,
            COUNT(*) FILTER (WHERE event_type ILIKE '%fail%' OR event_type ILIKE '%error%')::bigint AS failure_events_24h
          FROM audit_events
          WHERE created_at > NOW() - INTERVAL '24 hours'
        `),
        db.query(`
          WITH signup_cohorts AS (
            SELECT
              date_trunc('week', created_at) AS cohort_week,
              pn_identifier
            FROM user_profiles
            WHERE created_at > NOW() - INTERVAL '12 weeks'
          ),
          activity AS (
            SELECT user_did AS actor_id, created_at FROM engagement
            UNION ALL
            SELECT creator_did AS actor_id, created_at FROM feeds
            UNION ALL
            SELECT added_by AS actor_id, created_at FROM feed_posts WHERE added_by IS NOT NULL
          ),
          scored AS (
            SELECT
              sc.cohort_week,
              sc.pn_identifier,
              MIN(CASE WHEN a.created_at <= sc.cohort_week + INTERVAL '2 days' THEN 1 ELSE 0 END) AS d1_active,
              MIN(CASE WHEN a.created_at <= sc.cohort_week + INTERVAL '8 days' THEN 1 ELSE 0 END) AS d7_active,
              MIN(CASE WHEN a.created_at <= sc.cohort_week + INTERVAL '31 days' THEN 1 ELSE 0 END) AS d30_active
            FROM signup_cohorts sc
            LEFT JOIN activity a ON a.actor_id = sc.pn_identifier
            GROUP BY sc.cohort_week, sc.pn_identifier
          )
          SELECT
            cohort_week,
            COUNT(*)::bigint AS cohort_size,
            SUM(CASE WHEN d1_active = 1 THEN 1 ELSE 0 END)::bigint AS d1_count,
            SUM(CASE WHEN d7_active = 1 THEN 1 ELSE 0 END)::bigint AS d7_count,
            SUM(CASE WHEN d30_active = 1 THEN 1 ELSE 0 END)::bigint AS d30_count
          FROM scored
          GROUP BY cohort_week
          ORDER BY cohort_week DESC
          LIMIT 12
        `),
      ]);

      const totalUsers = Number(usersRes.rows[0]?.total_users ?? 0);
      const verifiedUsers = Number(verifiedRes.rows[0]?.verified_users ?? 0);
      const storageConnected = Number(storageConnectedRes.rows[0]?.connected_users ?? 0);
      const totalPosts = Number(postsRes.rows[0]?.total_posts ?? 0);
      const firstEngagers = Number(firstEngagersRes.rows[0]?.first_engagers ?? 0);
      const monetizedUsers = Number(monetizedRes.rows[0]?.monetized_users ?? 0);
      const payoutEligibleUsers = Number(payoutEligibleRes.rows[0]?.payout_eligible_users ?? 0);

      const funnelSteps = [
        { key: 'identity_created', label: 'Identity Created', value: totalUsers },
        { key: 'verified', label: 'Verified', value: verifiedUsers },
        { key: 'storage_connected', label: 'Storage Connected', value: storageConnected },
        { key: 'first_post', label: 'First Post', value: totalPosts > 0 ? Math.min(totalUsers, totalPosts) : 0 },
        { key: 'first_engagement', label: 'First Engagement', value: firstEngagers },
        { key: 'monetization_active', label: 'Monetization Active', value: monetizedUsers },
        { key: 'payout_eligible', label: 'Payout Eligible', value: payoutEligibleUsers },
      ].map((step, idx, arr) => {
        if (idx === 0) return { ...step, conversionFromPrev: null as number | null };
        return { ...step, conversionFromPrev: pct(step.value, arr[idx - 1].value) };
      });

      let biggestDropStep: string | null = null;
      let lowestConv = Number.POSITIVE_INFINITY;
      for (const step of funnelSteps) {
        if (step.conversionFromPrev != null && step.conversionFromPrev < lowestConv) {
          lowestConv = step.conversionFromPrev;
          biggestDropStep = step.label;
        }
      }

      const engagementTotal = Number(engagementMixRes.rows[0]?.total ?? 0);
      const verifiedEngagement = Number(engagementMixRes.rows[0]?.verified_total ?? 0);
      const suspiciousEngagement = Number(engagementMixRes.rows[0]?.suspicious_total ?? 0);
      const uniqueEngagers = Number(uniqueEngagersRes.rows[0]?.unique_engagers ?? 0);
      const maxCreatorViews = Number(topCreatorRes.rows[0]?.max_creator_views ?? 0);
      const totalViews = Number(topCreatorRes.rows[0]?.total_views ?? 0);
      const anomalies24h = Number(anomaliesRes.rows[0]?.anomalies_24h ?? 0);

      const allocationValues = allocationsRes.rows.map((r) => Number(r.allocation_cents ?? 0)).filter((v) => Number.isFinite(v));
      const medianAllocationCents = percentile(allocationValues, 50);
      const p90AllocationCents = percentile(allocationValues, 90);
      const top10 = [...allocationValues].sort((a, b) => b - a).slice(0, 10).reduce((a, b) => a + b, 0);
      const totalAlloc = allocationValues.reduce((a, b) => a + b, 0);
      const allocationConcentrationTop10Share = pct(top10, totalAlloc);
      const netFundVolatility = Number(volatilityRes.rows[0]?.net_volatility ?? 0);
      const payoutInHold = Number(payoutRes.rows[0]?.in_hold ?? 0);
      const payoutPaid = Number(payoutRes.rows[0]?.paid ?? 0);
      const payoutHoldRatio = pct(payoutInHold, payoutInHold + payoutPaid);

      const events24h = Number(reliabilityRes.rows[0]?.events_24h ?? 0);
      const failureEvents24h = Number(reliabilityRes.rows[0]?.failure_events_24h ?? 0);
      const apiSuccessRate = events24h > 0 ? 1 - pct(failureEvents24h, events24h) : 1;

      const weeklyCohorts = cohortRes.rows.map((r) => {
        const size = Number(r.cohort_size ?? 0);
        return {
          cohortWeek: new Date(r.cohort_week).toISOString(),
          size,
          d1: pct(Number(r.d1_count ?? 0), size),
          d7: pct(Number(r.d7_count ?? 0), size),
          d30: pct(Number(r.d30_count ?? 0), size),
        };
      });

      const kpiValuesRaw: Record<string, number> = {
        funnel_identity_to_verified: pct(verifiedUsers, totalUsers),
        verified_engagement_share: pct(verifiedEngagement, engagementTotal),
        api_success_rate: apiSuccessRate,
        payout_hold_ratio: payoutHoldRatio,
      };

      const kpiValues = Object.fromEntries(
        KPI_REGISTRY.map((kpi) => {
          const value = Number(kpiValuesRaw[kpi.id] ?? 0);
          return [
            kpi.id,
            {
              value,
              tone: toneFromThresholds(value, kpi.thresholds),
              stale: false,
              notes: '',
            },
          ];
        }),
      );

      if (weeklyCohorts.length === 0) {
        notes.push('No cohorts available yet; forward-only windows will populate as activity accrues.');
      }
      if (allocationValues.length === 0) {
        missingMetrics.push('allocation_distribution');
      }
      if (events24h === 0) {
        notes.push('Reliability metrics are based on sparse recent audit events.');
      }

      const userImpactSummary =
        apiSuccessRate < 0.95
          ? 'Elevated failure rates likely impact onboarding and engagement surfaces.'
          : payoutHoldRatio > 0.25
            ? 'Payout hold pressure can degrade creator trust and retention.'
            : 'No major cross-layer impact inferred from current metrics.';

      return res.json({
        metricVersion: 'v2.0.0',
        generatedAt,
        dataLagSec: 60,
        completeness: {
          status: missingMetrics.length > 0 ? 'partial' : 'complete',
          missingEndpoints,
          missingMetrics,
          notes,
        },
        kpiRegistry: KPI_REGISTRY,
        kpiValues,
        funnel: {
          steps: funnelSteps,
          biggestDropStep,
        },
        cohorts: {
          weekly: weeklyCohorts,
        },
        quality: {
          verifiedEngagementShare: pct(verifiedEngagement, engagementTotal),
          uniqueEngagerRatio: pct(uniqueEngagers, engagementTotal),
          topCreatorShareViews: pct(maxCreatorViews, totalViews),
          suspiciousEngagementRatio: pct(suspiciousEngagement, engagementTotal),
          anomalyConfidenceScore: Math.max(0, Math.min(1, 1 - pct(anomalies24h, 200))),
        },
        economics: {
          payoutHoldRatio,
          medianAllocationCents,
          p90AllocationCents,
          allocationConcentrationTop10Share,
          netFundVolatility,
        },
        reliability: {
          apiSuccessRate,
          p95LatencyMs: 0,
          p99LatencyMs: 0,
          adminProbeFailureRate: pct(failureEvents24h, events24h || 1),
          incidentCount24h: failureEvents24h,
          userImpactSummary,
        },
      });
    } catch (error: unknown) {
      console.error('[admin] dashboard v2 analytics:', error);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to load dashboard v2 analytics',
      });
    }
  });
}
