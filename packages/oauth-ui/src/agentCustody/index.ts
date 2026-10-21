export { AgentCustodyError, custodyErrorCode } from './errors';
export {
  verifyAgentAccessToken,
  createAgentJwksSource,
  type AgentJwksSource,
  type AgentTokenClaims,
} from './agentToken';
export { fetchAgentDelegationStatus, type AgentDelegationStatus } from './delegationStatus';
export { findAgentOnThisMac, resolveAgentOwner } from './ownerMapping';
export { AgentCustodySessions, AGENT_CUSTODY_DECLINE_COOLDOWN_MS } from './custodySessions';
export {
  openOwnerCustody,
  ownerDriveToken,
  wipeOwnerCustody,
  type OwnerCustody,
  type OwnerVaultEntry,
} from './ownerCustody';
export { searchPrivate, readPrivateFileText, readPrivatePenText, type PrivateReadContext } from './privateReads';
export {
  createAgentCustodyBridge,
  agentApprovalPrompt,
  type AgentCustodyBridge,
  type AgentCustodyBridgeDeps,
} from './custodyBridge';
