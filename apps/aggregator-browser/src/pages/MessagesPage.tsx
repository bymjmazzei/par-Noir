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
import {
  CloudLayoutUpdateBanner,
  isCloudLayoutBehind,
} from '../components/CloudLayoutUpdateBanner';
import { dashboardStorageUrl } from '../config/dashboard';

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
  const [layoutBehind, setLayoutBehind] = useState(false);

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

  useEffect(() => {
    const oauthSession = PNOAuthService.loadSession();
    const token = oauthSession?.accessToken;
    const pn = userState.pnIdentifier || oauthSession?.pnIdentifier;
    if (!token || !pn || !userState.isUnlocked) {
      setLayoutBehind(false);
      return;
    }
    let cancelled = false;
    void isCloudLayoutBehind(token, pn).then((behind) => {
      if (!cancelled) setLayoutBehind(behind);
    });
    return () => {
      cancelled = true;
    };
  }, [userState.isUnlocked, userState.pnIdentifier]);

  const session = PNOAuthService.loadSession();
  const pnNameHint =
    (session as { pnName?: string } | null)?.pnName || session?.nickname || undefined;

  return (
    <div className="h-screen w-full bg-neutral-900 flex flex-col">
      <KeyDeviceBanner />
      <ConnectionHealthBanner />
      <CloudLayoutUpdateBanner />
      <div className="flex-1 min-h-0">
        {layoutBehind ? (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center text-text-secondary">
            <p className="text-text-primary font-medium mb-2">Messaging paused</p>
            <p className="text-sm max-w-md mb-4">
              Complete the cloud layout update in the dashboard Storage section, then return here.
            </p>
            <a
              href={dashboardStorageUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-amber-300 underline underline-offset-2"
            >
              Open dashboard Storage
            </a>
          </div>
        ) : (
          <Inbox
            initialThread={initialThread}
            onCreatorClick={onCreatorClick}
            onNotificationClick={onNotificationClick}
            channelClientId={channelClientId}
          />
        )}
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
