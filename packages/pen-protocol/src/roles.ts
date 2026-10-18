/** Pen document access roles and ACL helpers. */

export const PEN_ROLES = ['owner', 'collaborator', 'commentor', 'viewer'] as const;
export type PenRole = (typeof PEN_ROLES)[number];

export interface PenRoleAssignment {
  /** Hash of member pn (never store raw pn in plain text on disk when avoidable). */
  pnHash: string;
  role: PenRole;
  /** Member ML-DSA public key (base64); peers verify live edit batch signatures against it. */
  mlDsaPublicKey?: string;
  /** Owner's ML-DSA signature binding `mlDsaPublicKey` to `pnHash` for this doc. */
  keyAttestation?: { by: string; signature: string };
}

export type PenAclAction =
  | 'read'
  | 'edit_draft'
  | 'live_edit'
  | 'submit_suggestion'
  | 'comment'
  | 'invite'
  | 'accept_suggestion'
  | 'publish'
  | 'revoke'
  | 'delete_doc';

const ROLE_ACTIONS: Record<PenRole, ReadonlySet<PenAclAction>> = {
  owner: new Set([
    'read',
    'edit_draft',
    'live_edit',
    'submit_suggestion',
    'comment',
    'invite',
    'accept_suggestion',
    'publish',
    'revoke',
    'delete_doc'
  ]),
  collaborator: new Set([
    'read',
    'edit_draft',
    'live_edit',
    'submit_suggestion',
    'comment',
    'invite',
    'accept_suggestion',
    'publish'
  ]),
  commentor: new Set(['read', 'comment']),
  viewer: new Set(['read'])
};

export function isPenRole(value: unknown): value is PenRole {
  return typeof value === 'string' && (PEN_ROLES as readonly string[]).includes(value);
}

export function canPenRole(role: PenRole, action: PenAclAction): boolean {
  return ROLE_ACTIONS[role]?.has(action) === true;
}

/** Resolve a member's role from assignments; owner is never revocable. */
export function resolvePenRole(
  assignments: PenRoleAssignment[] | undefined,
  pnHash: string,
  ownerPnHash?: string
): PenRole | null {
  const hash = String(pnHash || '').trim();
  if (!hash) return null;
  if (ownerPnHash && hash === ownerPnHash) return 'owner';
  const hit = (assignments || []).find((a) => a.pnHash === hash);
  if (!hit) return null;
  if (hit.role === 'owner') return 'owner';
  return hit.role;
}

/**
 * Apply a role change. Owner assignment cannot be removed or downgraded.
 * Returns null if the change is illegal.
 */
export function applyRoleChange(
  assignments: PenRoleAssignment[],
  ownerPnHash: string,
  targetPnHash: string,
  nextRole: PenRole | null,
  actorRole: PenRole
): PenRoleAssignment[] | null {
  if (!canPenRole(actorRole, 'revoke') && nextRole === null) return null;
  if (!canPenRole(actorRole, 'invite') && nextRole !== null) return null;
  if (targetPnHash === ownerPnHash) {
    // Owner is unrevokable and cannot be downgraded.
    if (nextRole !== 'owner' && nextRole !== null) return null;
    if (nextRole === null) return null;
  }
  const prior = assignments.find((a) => a.pnHash === targetPnHash);
  const without = assignments.filter((a) => a.pnHash !== targetPnHash);
  if (nextRole == null) return without;
  return [...without, { ...signingKeyOf(prior), pnHash: targetPnHash, role: nextRole }];
}

function signingKeyOf(
  a: PenRoleAssignment | undefined
): Pick<PenRoleAssignment, 'mlDsaPublicKey' | 'keyAttestation'> {
  return {
    ...(a?.mlDsaPublicKey ? { mlDsaPublicKey: a.mlDsaPublicKey } : {}),
    ...(a?.keyAttestation ? { keyAttestation: a.keyAttestation } : {})
  };
}

export function ensureOwnerAssignment(
  assignments: PenRoleAssignment[] | undefined,
  ownerPnHash: string
): PenRoleAssignment[] {
  const prior = (assignments || []).find((a) => a.pnHash === ownerPnHash);
  const base = (assignments || []).filter((a) => a.pnHash !== ownerPnHash);
  return [{ ...signingKeyOf(prior), pnHash: ownerPnHash, role: 'owner' }, ...base];
}

/** Attach or replace a member's ML-DSA verification key without changing their role. */
export function withMemberSigningKey(
  assignments: PenRoleAssignment[],
  pnHash: string,
  mlDsaPublicKey: string,
  keyAttestation?: PenRoleAssignment['keyAttestation']
): PenRoleAssignment[] {
  return assignments.map((a) => {
    if (a.pnHash !== pnHash) return a;
    const { keyAttestation: _drop, ...rest } = a;
    return { ...rest, mlDsaPublicKey, ...(keyAttestation ? { keyAttestation } : {}) };
  });
}
