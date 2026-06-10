/** Identity material unlocked during migration (no secrets on wire). */

export interface IdentityKeyMaterial {
  did: string;
  publicKey: string;
  mlDsaPublicKeyB64?: string;
  mlKemPublicKey: string;
  mlKemSecretKey: string;
  mlDsaSecretKey: Uint8Array;
  mlDsaPublicKey: Uint8Array;
  pnIdentifier: string;
}

export interface DualUnlockedIdentity {
  predecessor: IdentityKeyMaterial;
  successor: IdentityKeyMaterial;
}

export type MigrationStepKind =
  | 'drive_files'
  | 'zkp_reissue'
  | 'recovery_vault'
  | 'dm_rekey'
  | 'group_rewrap'
  | 'profile_publish'
  | 'custodian_reinvite'
  | 'lineage_zkp'
  | 'owned_assets_sync'
  | 'succession_register';

export interface MigrationStep {
  id: string;
  kind: MigrationStepKind;
  label: string;
  required: boolean;
}

export interface MigrationPlan {
  migrationId: string;
  predecessorPnIdentifier: string;
  successorPnIdentifier: string;
  predecessorDid: string;
  successorDid: string;
  steps: MigrationStep[];
  createdAt: string;
}

export interface MigrationProgress {
  migrationId: string;
  completedStepIds: string[];
  legacyDmRoots: Record<string, string>;
  updatedAt: string;
}

export interface EncryptedFilePackage {
  encrypted: string;
  iv: string;
  salt: string;
  metadata?: {
    originalName?: string;
    originalSize?: number;
    originalMimeType?: string;
  };
}

export interface DriveFileRef {
  fileId: string;
  driveFileId?: string;
  name: string;
}

export interface ZkpReissueSource {
  dataPointId: string;
  context: string;
  publicInputs: Record<string, unknown>;
  expiresAtMs?: number;
}

export interface ConnectionRef {
  connectionId: string;
  kemCiphertext?: string;
  participantPnIdentifier: string;
  /** true when this user was the connection requester (kemCiphertext targets their mlKem pk) */
  isRequester: boolean;
}

export interface GroupMemberWrap {
  memberPnIdentifier: string;
  wrappedChatKey: string;
  accessRole: 'readWrite' | 'readOnly';
}

export interface GroupRewrapInput {
  groupId: string;
  ownerPnIdentifier: string;
  chatKeyB64: string;
  members: GroupMemberWrap[];
}

export interface LineageZkpPair {
  predecessorProof: string;
  successorProof: string;
}

export const MIGRATION_STATE_KEY = 'pn_identity_migration_state';
export const LINEAGE_ZKP_CONTEXT = 'par-noir.zkp.identity_succession';
export const LINEAGE_ZKP_TYPE = 'identity_succession';
