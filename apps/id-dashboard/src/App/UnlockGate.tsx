import React from 'react';
import { Logo } from '../components/Logo';
import { HostedShellLaunch, type HostedShellSession } from '@par-noir/oauth-ui';

export interface UnlockGateProps {
  authenticatedUser: any;
  showTransferReceiver: any;
  pwaState: any;
  handleMainFormSubmit: any;
  handleShellSession: (session: HostedShellSession) => void;
  selectedStoredIdentity: any;
  handleIdentitySelect: any;
  handleDeleteIdentity: any;
  setShowCreateForm: any;
  mainForm: any;
  setMainForm: any;
  setSelectedStoredIdentity: any;
  setShowUnlockFromUsbModal: any;
  hasNfcSupport: any;
  setShowUnlockFromNfcModal: any;
  showMainPNName: any;
  setShowMainPNName: any;
  showMainPasscode: any;
  setShowMainPasscode: any;
  loading: any;
  setShowRecoveryModal: any;
}

export function UnlockGate(props: UnlockGateProps) {
  const { authenticatedUser, showTransferReceiver, handleShellSession, loading } = props;

  return (
    <>
      {!authenticatedUser && !showTransferReceiver && (
        <div
          className="max-w-6xl mx-auto text-text-primary px-4 sm:px-6 lg:px-8"
          style={{ paddingTop: 'calc(3rem + env(safe-area-inset-top, 0px))' }}
        >
          <div className="flex justify-center items-center mt-2 mb-2">
            <div className="w-48 h-48 sm:w-56 sm:h-56 md:w-64 md:h-64 lg:w-72 lg:h-72 xl:w-80 xl:h-80">
              <Logo />
            </div>
          </div>
          <div className="max-w-md mx-auto relative z-20">
            <div className="bg-modal-bg rounded-lg shadow p-6">
              <p className="text-sm text-text-secondary mb-4">
                Key 1 and Key 2 stay in par Noir Unlock. This page only receives a session.
              </p>
              <HostedShellLaunch
                buttonOnly
                op="session"
                label={loading ? 'Unlocking...' : 'Continue in par Noir Unlock'}
                onSession={(session) => {
                  void handleShellSession(session);
                }}
              />
              <div className="mt-4 grid grid-cols-2 gap-2">
                <HostedShellLaunch buttonOnly op="create" label="Create New pN" onSession={(session) => {
                  void import('../services/shellResultFile').then(({ downloadShellIdentityFile }) => downloadShellIdentityFile(session));
                }} />
                <HostedShellLaunch buttonOnly op="recovery" label="Recover pN" onSession={(session) => {
                  void import('../services/shellResultFile').then(({ downloadShellIdentityFile }) => downloadShellIdentityFile(session, 'par-noir-recovered.json'));
                }} />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
