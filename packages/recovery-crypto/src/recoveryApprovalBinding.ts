/**
 * Passcode-bound recovery approval binding for custodians without an unlocked pN identity.
 * API verifies custodianship ZK v2 + this binding (no cleartext share).
 */

import { RECOVERY_APPROVAL_CONTEXT } from './recoveryZkContexts';

export interface RecoveryApprovalBinding {
  v: 1;
  context: typeof RECOVERY_APPROVAL_CONTEXT;
  identityPublicKey: string;
  requestId: string;
  custodianId: string;
  shareIndex: number;
  custodianshipZkp: string;
  nonce: string;
  binding: string;
}

async function sha256Hex(data: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Create approval binding proving custodian passcode knowledge without sending share bytes. */
export async function createRecoveryApprovalBinding(params: {
  identityPublicKey: string;
  requestId: string;
  custodianId: string;
  shareIndex: number;
  custodianshipZkp: string;
  custodianPasscode: string;
}): Promise<RecoveryApprovalBinding> {
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
  const nonce = Array.from(nonceBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const binding = await sha256Hex(
    `${params.custodianshipZkp}:${params.requestId}:${params.custodianId}:${params.shareIndex}:${params.custodianPasscode}:${nonce}`
  );
  return {
    v: 1,
    context: RECOVERY_APPROVAL_CONTEXT,
    identityPublicKey: params.identityPublicKey,
    requestId: params.requestId,
    custodianId: params.custodianId,
    shareIndex: params.shareIndex,
    custodianshipZkp: params.custodianshipZkp,
    nonce,
    binding,
  };
}

export function serializeApprovalBinding(binding: RecoveryApprovalBinding): string {
  return JSON.stringify(binding);
}

export function parseApprovalBinding(serialized: string): RecoveryApprovalBinding {
  const parsed = JSON.parse(serialized) as RecoveryApprovalBinding;
  if (parsed.v !== 1 || parsed.context !== RECOVERY_APPROVAL_CONTEXT) {
    throw new Error('invalid recovery approval binding');
  }
  return parsed;
}

export async function verifyRecoveryApprovalBinding(
  binding: RecoveryApprovalBinding,
  custodianPasscode: string
): Promise<boolean> {
  const expected = await sha256Hex(
    `${binding.custodianshipZkp}:${binding.requestId}:${binding.custodianId}:${binding.shareIndex}:${custodianPasscode}:${binding.nonce}`
  );
  return expected === binding.binding;
}
