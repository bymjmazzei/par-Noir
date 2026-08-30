/**
 * L5 messaging viewport — first-party origin embed filtered to one OAuth client_id channel.
 * Integrators iframe this page; they do not call /api/messages with their Bearer.
 */

import { useMemo } from 'react';
import { MessagesPage } from './MessagesPage';
import { PLATFORM_CHANNEL_CLIENT_ID } from '@par-noir/messaging-ui';

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

export function EmbedMessagingPage() {
  const channelClientId = useMemo(() => readEmbedClientId(), []);

  return (
    <div className="h-screen w-full bg-neutral-900 flex flex-col" data-pn-embed-channel={channelClientId}>
      <div className="px-3 py-2 border-b border-neutral-700 text-xs text-neutral-400">
        Messaging · {channelClientId === PLATFORM_CHANNEL_CLIENT_ID ? 'Platform' : channelClientId}
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
