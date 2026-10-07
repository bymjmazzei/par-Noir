import type { PenRole } from '@par-noir/pen-protocol';
import { API_ENDPOINT } from '../config/api';
import { ownerFetch } from './penOwnerFetch';
import type { PenSession } from './penSession';

export type PenDocInviteMetadata = {
  docId: string;
  title: string;
  role: PenRole;
  ownerPn: string;
  expiresAt: string;
  claimed: boolean;
};

export async function fetchPenDocInviteMetadata(inviteId: string): Promise<PenDocInviteMetadata> {
  const res = await fetch(`${API_ENDPOINT}/api/pen/invites/${encodeURIComponent(inviteId)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'invite_lookup_failed');
  }
  return (await res.json()) as PenDocInviteMetadata;
}

export async function createPenDocInvite(params: {
  session: PenSession;
  docId: string;
  groupId: string;
  title: string;
  role: PenRole;
}): Promise<{ inviteId: string; joinUrl: string; expiresAt: string }> {
  const res = await ownerFetch(
    'POST',
    `/api/pen/docs/${encodeURIComponent(params.docId)}/invites`,
    {
      groupId: params.groupId,
      title: params.title,
      role: params.role
    },
    { pnIdentifier: params.session.pnIdentifier }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'invite_create_failed');
  }
  return (await res.json()) as { inviteId: string; joinUrl: string; expiresAt: string };
}

export async function claimPenDocInvite(params: {
  session: PenSession;
  inviteId: string;
}): Promise<{ delivered: boolean; docId: string; role: PenRole; title: string }> {
  if (!params.session.mlKemSecretKey) {
    throw new Error('messaging_keys_required');
  }
  const profileRes = await ownerFetch(
    'GET',
    `/api/profile/${encodeURIComponent(params.session.pnIdentifier)}`,
    undefined,
    { pnIdentifier: params.session.pnIdentifier }
  );
  if (!profileRes.ok) {
    throw new Error('profile_lookup_failed');
  }
  const profile = (await profileRes.json().catch(() => ({}))) as { mlKemPublicKey?: string };
  const inviteeMlKemPublicKey = String(profile.mlKemPublicKey || '').trim();
  if (!inviteeMlKemPublicKey) {
    throw new Error(
      'Messaging keys unavailable. Lock and unlock your pN before accepting a doc invite.'
    );
  }
  const res = await ownerFetch(
    'POST',
    `/api/pen/invites/${encodeURIComponent(params.inviteId)}/claim`,
    { inviteeMlKemPublicKey },
    { pnIdentifier: params.session.pnIdentifier }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error_description?: string }).error_description ||
        (err as { error?: string }).error ||
        'claim_failed'
    );
  }
  const body = (await res.json()) as {
    delivered: boolean;
    docId: string;
    role: PenRole;
    title: string;
  };
  return body;
}
