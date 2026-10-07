export type { Connection, ConnectionStatus, PendingRequests, ConnectionRow } from './types.js';
export { LEGACY_CONNECTION_REQUEST_KEY_MESSAGE } from './types.js';
export { normalizePnId, withPnPrefix } from './normalize.js';
export {
  MESSAGING_CONNECT_PN_ID_RE,
  buildMessagingConnectUrl,
  normalizeConnectPnIdentifier,
  parseMessagingConnectPath,
  type MessagingConnectPath
} from './messagingConnectUrl.js';
export {
  createConnectionsClient,
  type ConnectionsClient,
  type ConnectionsClientDeps
} from './createConnectionsClient.js';
