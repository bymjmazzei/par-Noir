export interface Connection {
  connectionId: string;
  userPnIdentifier: string;
  status: 'pending_sent' | 'pending_received' | 'accepted' | 'blocked';
  createdAt: string;
  acceptedAt?: string;
  peerMlKemPublicKey?: string;
  peerMailboxRouteKey?: string;
}

export interface ConnectionStatus {
  status: 'not_connected' | 'pending_sent' | 'pending_received' | 'connected' | 'blocked';
  connectionId?: string;
}

export interface PendingRequests {
  sent: Connection[];
  received: Connection[];
}

export const LEGACY_CONNECTION_REQUEST_KEY_MESSAGE =
  'This connection request was sent before messaging keys were attached. Ask them to cancel and send a new request.';

export type ConnectionRow = Connection;
