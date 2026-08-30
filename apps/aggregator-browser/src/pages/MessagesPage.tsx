/**
 * Messages page - Inbox (messages and notifications).
 */

import { useCallback, useEffect, useState } from 'react';
import { Inbox } from '../components/Inbox';
import { Notification } from '../services/notificationService';
import { KeyDeviceBanner } from '../components/KeyDeviceBanner';
import { ConnectionHealthBanner } from '../components/ConnectionHealthBanner';
import { DmCryptoUnlockModal } from '../components/DmCryptoUnlockModal';
import { useUserState } from '../contexts/UserStateContext';
import { PNOAuthService } from '../services/pnOAuthService';
import {
  DM_IDENTITY_CHANGE_EVENT,
  hasStoredEncryptedIdentity,
  isDmIdentityReady,
} from '../services/dmIdentitySession';
import { restoreMessagingAfterOAuth } from '../services/messagingOAuthHandoff';

const SHOW_DM_UNLOCK_EVENT = 'pn_show_dm_unlock_modal';

export interface MessagesPageProps {
  initialThread: { participantPnIdentifier: string; participantName?: string; channelClientId?: string } | null;
  onCreatorClick: (creatorId: string) => void;
  onNotificationClick: (notification: Notification) => void;
  /** L5 embed channel filter. */
  channelClientId?: string;
}

export function MessagesPage({
  initialThread,
  onCreatorClick,
  onNotificationClick,
  channelClientId,
}: MessagesPageProps) {
  const { userState } = useUserState();
  const [showDmUnlock, setShowDmUnlock] = useState(false);
  const [dmUnlockDismissed, setDmUnlockDismissed] = useState(false);

  const refreshDmUnlockOffer = useCallback(() => {
    restoreMessagingAfterOAuth();

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
      hasStoredEncryptedIdentity() &&
      !isDmIdentityReady();
    setShowDmUnlock(shouldOfferUnlock);
  }, [userState.isUnlocked, userState.pnIdentifier, dmUnlockDismissed]);

  useEffect(() => {
    refreshDmUnlockOffer();
    const onIdentityChange = () => refreshDmUnlockOffer();
    const onShowModal = () => {
      setDmUnlockDismissed(false);
      setShowDmUnlock(true);
    };
    window.addEventListener(DM_IDENTITY_CHANGE_EVENT, onIdentityChange);
    window.addEventListener(SHOW_DM_UNLOCK_EVENT, onShowModal);
    return () => {
      window.removeEventListener(DM_IDENTITY_CHANGE_EVENT, onIdentityChange);
      window.removeEventListener(SHOW_DM_UNLOCK_EVENT, onShowModal);
    };
  }, [refreshDmUnlockOffer]);

  const session = PNOAuthService.loadSession();
  const pnNameHint =
    (session as { pnName?: string } | null)?.pnName || session?.nickname || undefined;

  return (
    <div className="h-screen w-full bg-neutral-900 flex flex-col">
      <KeyDeviceBanner />
      <ConnectionHealthBanner />
      <div className="flex-1 min-h-0">
        <Inbox
          initialThread={initialThread}
          onCreatorClick={onCreatorClick}
          onNotificationClick={onNotificationClick}
          channelClientId={channelClientId}
        />
      </div>
      {showDmUnlock && hasStoredEncryptedIdentity() && (
        <DmCryptoUnlockModal
          pnName={pnNameHint}
          onUnlocked={() => {
            setShowDmUnlock(false);
            setDmUnlockDismissed(false);
            refreshDmUnlockOffer();
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
