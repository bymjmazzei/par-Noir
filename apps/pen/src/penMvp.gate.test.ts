/**
 * Gate: Pen roles ACL + publish≠feed split helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  canPenRole,
  applyRoleChange,
  ensureOwnerAssignment,
  resolvePenRole,
  publishCurrentToPast,
  currentDirPath,
  draftsDirPath,
  pastDirPath,
  PEN_PUBLISH_KIND,
  PEN_DOC_BOOTSTRAP_KIND
} from '@par-noir/pen-protocol';

describe('Pen MVP gates', () => {
  it('commentor can suggest but not invite or accept', () => {
    expect(canPenRole('commentor', 'submit_suggestion')).toBe(true);
    expect(canPenRole('commentor', 'invite')).toBe(false);
    expect(canPenRole('commentor', 'accept_suggestion')).toBe(false);
  });

  it('collaborator can invite and accept; cannot revoke owner', () => {
    expect(canPenRole('collaborator', 'invite')).toBe(true);
    expect(canPenRole('collaborator', 'accept_suggestion')).toBe(true);
    const owner = 'ownerhash';
    const roles = ensureOwnerAssignment([{ pnHash: 'peer', role: 'collaborator' }], owner);
    expect(applyRoleChange(roles, owner, owner, null, 'collaborator')).toBeNull();
    expect(resolvePenRole(roles, owner, owner)).toBe('owner');
  });

  it('doc folder layout is current/drafts/past', () => {
    expect(currentDirPath('d1')).toBe('par-noir-pen/d1/current');
    expect(draftsDirPath('d1')).toBe('par-noir-pen/d1/drafts');
    expect(pastDirPath('d1')).toBe('par-noir-pen/d1/past');
    const pub = publishCurrentToPast('d1', new Date('2026-09-22T12:00:00Z'));
    expect(pub.pastDir).toContain('/past/v-');
  });

  it('publish and bootstrap are distinct outbox kinds from feed handoff', () => {
    expect(PEN_PUBLISH_KIND).toBe('pen.publish');
    expect(PEN_DOC_BOOTSTRAP_KIND).toBe('pen.doc_bootstrap');
    // Connect-to-feed is client handoff (pen_publish:) — not an apply-inbound kind.
    expect(PEN_PUBLISH_KIND).not.toContain('feed');
  });
});
