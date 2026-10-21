import { sealSocialEnvelope } from '@par-noir/dm-crypto';
import {
  PEN_AGENT_DRAFT_MAX_BYTES,
  isPenAgentDraftId,
  penAgentDraftContextId,
  penAgentDraftSubmissionBytes,
  validatePenAgentBuild,
  type PenAgentDraftSubmission,
} from '@par-noir/pen-protocol';
import { McpToolError } from './errors';

/**
 * Seals a proposed PenAgentBuild to the owner's ML-KEM key, so whatever carries it next
 * (the local CLI's HTTP call, or the remote /mcp handler in-process) only ever holds
 * ciphertext. The build is validated first, before the owner key is fetched.
 */
export async function sealPenAgentDraft(input: {
  draftId: string;
  build: unknown;
  ownerMlKemPublicKey: () => Promise<string>;
}): Promise<PenAgentDraftSubmission> {
  if (!isPenAgentDraftId(input.draftId)) throw new McpToolError('invalid_request');
  if (!validatePenAgentBuild(input.build).ok) throw new McpToolError('invalid_draft');
  const ownerKey = await input.ownerMlKemPublicKey();
  const envelope = await sealSocialEnvelope(ownerKey, penAgentDraftContextId(input.draftId), input.build);
  const submission = { draftId: input.draftId, envelope };
  if (penAgentDraftSubmissionBytes(submission) > PEN_AGENT_DRAFT_MAX_BYTES) {
    throw new McpToolError('draft_too_large');
  }
  return submission;
}
