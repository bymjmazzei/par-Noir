/**
 * Attestations as Pen Knowledge claim docs under par-noir-pen/{docId}/: ML-DSA genesis
 * (authorship), sections sealed with a docKey, docKey wrapped for the owner in the Groups
 * sheet. Same custody as every other Pen doc.
 */

import { generateChatKey, generateGroupId, wrapChatKeyForOwner } from '@par-noir/dm-crypto';
import {
  KNOWLEDGE_CLAIM_CLASS_ID,
  buildKnowledgeClaimDoc,
  knowledgeSourceFromSection,
  type KnowledgeClaim,
  type PenDocManifest,
  type PenTemplate
} from '@par-noir/pen-protocol';
import { appendDeviceGroupRow } from './deviceSocial.js';
import { decryptSectionPayload, encryptSectionJson, openDocKeysFromGroups } from './penCloudDoc.js';
import { readDocTree, readLibraryIndex, removePenDoc, upsertLibrarySummary, writePenDocFiles } from './penDriveTree.js';

export type KnowledgeDriveTarget = {
  accessToken: string;
  pnFolderId: string;
  groupsSheetId: string;
};

/** One held proof, flattened from a Knowledge doc's claims. */
export type DeviceKnowledgeClaim = {
  docId: string;
  templateId: string;
  sourceDataPointId: string;
  dataPointId: string;
  proofType: string;
  zkpProof: string;
  verificationLevel: 'basic' | 'enhanced' | 'verified';
  provider: string;
  verifiedAt: string;
  expiresAt?: string;
};

function randomKnowledgeDocId(): string {
  return `pen_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

async function knowledgeManifests(
  target: Pick<KnowledgeDriveTarget, 'accessToken' | 'pnFolderId'>
): Promise<PenDocManifest[]> {
  const rows = (await readLibraryIndex(target.accessToken, target.pnFolderId)).filter(
    (row) => row.classId === KNOWLEDGE_CLAIM_CLASS_ID && typeof row.docId === 'string' && row.docId
  );
  const out: PenDocManifest[] = [];
  for (const row of rows) {
    const tree = await readDocTree({
      accessToken: target.accessToken,
      pnFolderId: target.pnFolderId,
      docId: String(row.docId),
    });
    if (tree?.manifest) out.push(tree.manifest as PenDocManifest);
  }
  return out;
}

/** Write a new Knowledge doc and remove the pN's previous doc for the same source data point. */
export async function writeKnowledgeClaimDoc(params: KnowledgeDriveTarget & {
  ownerPnIdentifier: string;
  template: PenTemplate;
  sourceDataPointId: string;
  source: Record<string, string>;
  claims: KnowledgeClaim[];
  signingKeys: { secretKey: Uint8Array; publicKey: Uint8Array };
  mlKemSecretKey: string;
}): Promise<PenDocManifest> {
  const docId = randomKnowledgeDocId();
  const groupId = generateGroupId();
  const doc = buildKnowledgeClaimDoc({
    docId,
    groupId,
    template: params.template,
    authorPn: params.ownerPnIdentifier,
    sourceDataPointId: params.sourceDataPointId,
    source: params.source,
    claims: params.claims,
    secretKey: params.signingKeys.secretKey,
    publicKey: params.signingKeys.publicKey,
  });
  const prior = (await knowledgeManifests(params)).filter(
    (m) => m.knowledge?.sourceDataPointId === params.sourceDataPointId
  );

  const docKey = generateChatKey();
  await appendDeviceGroupRow(params.accessToken, params.groupsSheetId, {
    groupId,
    ownerPnIdentifier: params.ownerPnIdentifier,
    title: doc.manifest.title,
    createdAt: doc.manifest.createdAt,
    memberPnIdentifier: params.ownerPnIdentifier,
    accessRole: 'readWrite',
    wrappedChatKey: await wrapChatKeyForOwner(docKey, params.mlKemSecretKey, groupId),
  });
  const currentSections = [];
  for (const section of doc.sections) {
    currentSections.push({ slug: section.slug, ciphertext: await encryptSectionJson(section, docKey) });
  }
  await writePenDocFiles({
    accessToken: params.accessToken,
    pnFolderId: params.pnFolderId,
    docId,
    manifest: doc.manifest,
    chain: doc.chain,
    currentSections,
  });
  await upsertLibrarySummary(params.accessToken, params.pnFolderId, {
    docId,
    title: doc.manifest.title,
    templateId: doc.manifest.templateId,
    classId: doc.manifest.classId,
    updatedAt: doc.manifest.updatedAt,
  });
  for (const old of prior) {
    await removePenDoc(params.accessToken, params.pnFolderId, old.docId);
  }
  return doc.manifest;
}

/** Every held proof across the pN's Knowledge docs (manifests only; no docKey needed). */
export async function listDeviceKnowledgeClaims(
  target: Pick<KnowledgeDriveTarget, 'accessToken' | 'pnFolderId'>
): Promise<DeviceKnowledgeClaim[]> {
  const out: DeviceKnowledgeClaim[] = [];
  for (const manifest of await knowledgeManifests(target)) {
    const knowledge = manifest.knowledge;
    if (!knowledge) continue;
    for (const claim of knowledge.claims) {
      if (!claim.proofRef) continue;
      out.push({
        docId: manifest.docId,
        templateId: manifest.templateId,
        sourceDataPointId: knowledge.sourceDataPointId || claim.dataPointId,
        dataPointId: claim.dataPointId,
        proofType: claim.proofType || '',
        zkpProof: claim.proofRef,
        verificationLevel: claim.verificationLevel || 'basic',
        provider: claim.provider || '',
        verifiedAt: claim.verifiedAt || manifest.createdAt,
        expiresAt: claim.expiresAt,
      });
    }
  }
  return out;
}

/** Raw answers behind a source data point, decrypted with the owner's docKey (edit pre-fill). */
export async function readKnowledgeClaimSource(params: KnowledgeDriveTarget & {
  sourceDataPointId: string;
  mlKemSecretKey: string;
}): Promise<Record<string, string> | null> {
  const manifest = (await knowledgeManifests(params)).find(
    (m) => m.knowledge?.sourceDataPointId === params.sourceDataPointId
  );
  if (!manifest?.groupId) return null;
  const tree = await readDocTree({
    accessToken: params.accessToken,
    pnFolderId: params.pnFolderId,
    docId: manifest.docId,
  });
  const source = tree?.currentSections.find((s) => s.slug === 'source');
  if (!source) return null;
  const [opened] = await openDocKeysFromGroups({
    accessToken: params.accessToken,
    groupsSheetId: params.groupsSheetId,
    groupId: manifest.groupId,
    mlKemSecretKey: params.mlKemSecretKey,
  });
  if (!opened) return null;
  return knowledgeSourceFromSection(await decryptSectionPayload(source.ciphertext, opened.docKey));
}
