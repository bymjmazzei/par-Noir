/**
 * L5 messaging viewport — first-party origin embed filtered to one OAuth client_id channel.
 * Integrators iframe this page; they do not call /api/messages with their Bearer.
 */

import { useEffect, useMemo } from 'react';
import {
  PN_MESSAGING_EMBED_HANDSHAKE,
  PN_MESSAGING_EMBED_READY,
  type MessagingEmbedPostMessage
} from '@par-noir/oauth-ui';
import { MessagesPage } from './MessagesPage';
import { PLATFORM_CHANNEL_CLIENT_ID } from '@par-noir/messaging-ui';
import { LockButtonWithContext } from '../components/LockButtonWithContext';

function readEmbedClientId(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = (params.get('client_id') || params.get('channelClientId') || '').trim();
    if (!raw || raw === 'browser-app' || raw === 'messaging-app' || raw === PLATFORM_CHANNEL_CLIENT_ID) {
      return PLATFORM_CHANNEL_CLIENT_ID;
    }
    return raw;
  } catch {
    return PLATFORM_CHANNEL_CLIENT_ID;
  }
}

function postToParent(msg: MessagingEmbedPostMessage) {
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(msg, '*');
    }
  } catch {
    /* ignore */
  }
}

export function EmbedMessagingPage({ onLockUnlock }: { onLockUnlock?: () => void }) {
  const channelClientId = useMemo(() => readEmbedClientId(), []);

  useEffect(() => {
    postToParent({ v: 1, type: PN_MESSAGING_EMBED_HANDSHAKE, clientId: channelClientId });
    postToParent({ v: 1, type: PN_MESSAGING_EMBED_READY, clientId: channelClientId });
  }, [channelClientId]);

  return (
    <div className="h-screen w-full bg-neutral-900 flex flex-col" data-pn-embed-channel={channelClientId}>
      <div className="px-3 py-2 border-b border-neutral-700 flex items-center justify-between gap-2">
        <div className="text-xs text-neutral-400 truncate">
          Messaging · {channelClientId === PLATFORM_CHANNEL_CLIENT_ID ? 'Platform' : channelClientId}
        </div>
        {onLockUnlock ? (
          <LockButtonWithContext onLockUnlock={onLockUnlock} currentContext={null} availableContexts={[]} />
        ) : null}
      </div>
      <div className="flex-1 min-h-0">
        <MessagesPage
          initialThread={null}
          channelClientId={channelClientId}
          onCreatorClick={() => undefined}
          onNotificationClick={() => undefined}
        />
      </div>
    </div>
  );
}
