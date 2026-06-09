import type { RecoveryZkApprovalPayload } from './recoveryZkContexts';

export type RecoveryShareStatus = 'invited' | 'accepted' | 'revoked';

export interface PendingShareRow {
  shareIndex: number;
  encryptedShare: string;
  createdAt: string;
}

export interface AssignedCustodianRow {
  custodianId: string;
  name: string;
  custodianType: string;
  encryptedShare: string;
  shareIndex: number;
  custodianshipCredential: string;
  status: RecoveryShareStatus | string;
  createdAt: string;
  unrevokable: boolean;
  custodianPublicKey?: string;
  custodianPnIdentifier?: string;
}

export interface RecoveryQuorumInput {
  approvals: Array<Pick<RecoveryZkApprovalPayload, 'custodianId' | 'shareIndex'>>;
  custodians: Array<Pick<AssignedCustodianRow, 'custodianId' | 'status' | 'unrevokable'>>;
  threshold: number;
}

export interface RecoveryQuorumResult {
  approvalCount: number;
  thresholdMet: boolean;
  includesUnrevokableShare: boolean;
  ready: boolean;
  reason?: 'missing_unrevokable_approval';
}

export function parseUnrevokableFlag(value: unknown): boolean {
  if (value === true || value === 'true' || value === '1') return true;
  return false;
}

export function normalizeCustodianStatus(status: string | undefined): RecoveryShareStatus | string {
  const s = (status || '').toLowerCase();
  if (s === 'accepted' || s === 'invited' || s === 'revoked') return s;
  if (s === 'active' || s === 'pending') return 'invited';
  if (s === 'vault') return 'revoked';
  return s || 'invited';
}

export function isCustodianRevokable(row: Pick<AssignedCustodianRow, 'unrevokable' | 'status'>): boolean {
  if (parseUnrevokableFlag(row.unrevokable)) return false;
  const status = normalizeCustodianStatus(String(row.status));
  return status !== 'revoked';
}

export function findCustodianForApproval(
  custodians: AssignedCustodianRow[],
  approval: { custodianId?: string; shareIndex?: number }
): AssignedCustodianRow | undefined {
  return custodians.find(
    (c) =>
      normalizeCustodianStatus(String(c.status)) !== 'revoked'
      && (c.custodianId === approval.custodianId || c.shareIndex === approval.shareIndex)
  );
}

export function recoveryMeetsQuorumRule(input: RecoveryQuorumInput): RecoveryQuorumResult {
  const threshold = Math.max(2, input.threshold || 2);
  const approvalCount = input.approvals.length;
  const thresholdMet = approvalCount >= threshold;

  let includesUnrevokableShare = false;
  for (const approval of input.approvals) {
    const row = findCustodianForApproval(input.custodians as AssignedCustodianRow[], approval);
    if (
      row
      && parseUnrevokableFlag(row.unrevokable)
      && normalizeCustodianStatus(String(row.status)) === 'accepted'
    ) {
      includesUnrevokableShare = true;
      break;
    }
  }

  const ready = thresholdMet && includesUnrevokableShare;
  return {
    approvalCount,
    thresholdMet,
    includesUnrevokableShare,
    ready,
    reason: thresholdMet && !includesUnrevokableShare ? 'missing_unrevokable_approval' : undefined,
  };
}

export function countAcceptedCustodians(custodians: AssignedCustodianRow[]): {
  accepted: number;
  acceptedUnrevokable: number;
  invited: number;
} {
  let accepted = 0;
  let acceptedUnrevokable = 0;
  let invited = 0;
  for (const c of custodians) {
    const status = normalizeCustodianStatus(String(c.status));
    if (status === 'revoked') continue;
    if (status === 'accepted') {
      accepted += 1;
      if (parseUnrevokableFlag(c.unrevokable)) acceptedUnrevokable += 1;
    } else if (status === 'invited') {
      invited += 1;
    }
  }
  return { accepted, acceptedUnrevokable, invited };
}

/** Share indices 1..totalShares not in pending or non-revoked custodian rows. */
export function computeMissingShareIndices(params: {
  totalShares: number;
  assignedIndices: number[];
  pendingIndices: number[];
}): number[] {
  const total = Math.max(0, params.totalShares || 0);
  const covered = new Set<number>();
  for (const idx of params.assignedIndices) {
    if (idx > 0) covered.add(idx);
  }
  for (const idx of params.pendingIndices) {
    if (idx > 0) covered.add(idx);
  }
  const missing: number[] = [];
  for (let i = 1; i <= total; i += 1) {
    if (!covered.has(i)) missing.push(i);
  }
  return missing;
}

export function buildCustodianInvitationPayload(row: {
  invitationId: string;
  custodianId: string;
  custodianName: string;
  custodianType: string;
  contactType?: string;
  contactValue?: string;
  identityName?: string;
  identityUsername?: string;
  identityPublicKey: string;
  shareIndex: number;
  custodianshipZkp: string;
  unrevokable?: boolean;
}): Record<string, unknown> {
  return {
    invitationId: row.invitationId,
    custodianId: row.custodianId,
    custodianName: row.custodianName,
    custodianType: row.custodianType,
    contactType: row.contactType,
    contactValue: row.contactValue,
    identityName: row.identityName,
    identityUsername: row.identityUsername,
    identityPublicKey: row.identityPublicKey,
    shareIndex: row.shareIndex,
    custodianshipZkp: row.custodianshipZkp,
    unrevokable: row.unrevokable === true,
  };
}
