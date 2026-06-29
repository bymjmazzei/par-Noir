/**
 * Messages page - Inbox (messages and notifications).
 */

import React, { useEffect, useState } from 'react';
import { Inbox } from '../components/Inbox';
import { Notification } from '../services/notificationService';
import { KeyDeviceBanner } from '../components/KeyDeviceBanner';
import { ConnectionHealthBanner } from '../components/ConnectionHealthBanner';
import { DmCryptoUnlockModal } from '../components/DmCryptoUnlockModal';
import { useUserState } from '../contexts/UserStateContext';
import { PNOAuthService } from '../services/pnOAuthService';
import {
  hasStoredEncryptedIdentity,
  isDmIdentityReady,
  needsMessagingIdentityHandoff,
  restoreDmSessionFromStorage,
} from '../services/dmIdentitySession';

export interface MessagesPageProps {
  initialThread: { participantPnIdentifier: string; participantName?: string } | null;
  onCreatorClick: (creatorId: string) => void;
  onNotificationClick: (notification: Notification) => void;
}

export function MessagesPage({ initialThread, onCreatorClick, onNotificationClick }: MessagesPageProps) {
  const { userState } = useUserState();
  const [showDmUnlock, setShowDmUnlock] = useState(false);
  const [dmUnlockDismissed, setDmUnlockDismissed] = useState(false);

  useEffect(() => {
    restoreDmSessionFromStorage();

    if (!userState.isUnlocked || !userState.pnIdentifier) {
      setShowDmUnlock(false);
      return;
    }
    const oauthSession = PNOAuthService.loadSession();
    if (!oauthSession?.accessToken) {
      setShowDmUnlock(false);
      return;
    }
    const shouldOfferUnlock =
      !dmUnlockDismissed &&
      needsMessagingIdentityHandoff() &&
      hasStoredEncryptedIdentity() &&
      !isDmIdentityReady();
    setShowDmUnlock(shouldOfferUnlock);
  }, [userState.isUnlocked, userState.pnIdentifier, dmUnlockDismissed]);

  const session = PNOAuthService.loadSession();
  const pnName =
    (session as { pnName?: string } | null)?.pnName || session?.nickname || '';

  return (
    <div className="h-screen w-full bg-neutral-900 flex flex-col">
      <KeyDeviceBanner />
      <ConnectionHealthBanner />
      <div className="flex-1 min-h-0">
        <Inbox
          initialThread={initialThread}
          onCreatorClick={onCreatorClick}
          onNotificationClick={onNotificationClick}
        />
      </div>
      {showDmUnlock && pnName && (
        <DmCryptoUnlockModal
          pnName={pnName}
          onUnlocked={() => {
            setShowDmUnlock(false);
            setDmUnlockDismissed(false);
          }}
          onCancel={() => {
            setShowDmUnlock(false);
            setDmUnlockDismissed(true);
          }}
        />
      )}
    </div>
  );
}
