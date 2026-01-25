/**
 * Messages page - Inbox (messages and notifications).
 */

import React from 'react';
import { Inbox } from '../components/Inbox';
import { Notification } from '../services/notificationService';

export interface MessagesPageProps {
  initialThread: { participantPnIdentifier: string; participantName?: string } | null;
  onCreatorClick: (creatorId: string) => void;
  onNotificationClick: (notification: Notification) => void;
}

export function MessagesPage({ initialThread, onCreatorClick, onNotificationClick }: MessagesPageProps) {
  return (
    <div className="h-screen w-full bg-neutral-900">
      <Inbox
        initialThread={initialThread}
        onCreatorClick={onCreatorClick}
        onNotificationClick={onNotificationClick}
      />
    </div>
  );
}
