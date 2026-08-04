import React from 'react';
import { Logo } from '../components/Logo';
import IdentitySelector from '../components/IdentitySelector';
import {
  KEY_1_LABEL,
  KEY_1_PLACEHOLDER,
  KEY_2_LABEL,
  KEY_2_PLACEHOLDER,
  KEYS_HELPER,
} from '../constants/credentialLabels';

export interface UnlockGateProps {
  authenticatedUser: any;
  showTransferReceiver: any;
  pwaState: any;
  handleMainFormSubmit: any;
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
  const {
    authenticatedUser,
    showTransferReceiver,
    pwaState,
    handleMainFormSubmit,
    selectedStoredIdentity,
    handleIdentitySelect,
    handleDeleteIdentity,
    setShowCreateForm,
    mainForm,
    setMainForm,
    setSelectedStoredIdentity,
    setShowUnlockFromUsbModal,
    hasNfcSupport,
    setShowUnlockFromNfcModal,
    showMainPNName,
    setShowMainPNName,
    showMainPasscode,
    setShowMainPasscode,
    loading,
    setShowRecoveryModal
  } = props;

  return (
    <>
                {/* Main Screen - Show when not authenticated and not on transfer route */}
        {!authenticatedUser && !showTransferReceiver && (
          <div
            className="max-w-6xl mx-auto text-text-primary px-4 sm:px-6 lg:px-8"
            style={{ paddingTop: 'calc(3rem + env(safe-area-inset-top, 0px))' }}
          >
            
            {/* Header */}
            <div className="flex justify-center items-center mt-2 mb-2">
              <div className="w-48 h-48 sm:w-56 sm:h-56 md:w-64 md:h-64 lg:w-72 lg:h-72 xl:w-80 xl:h-80">
                <Logo />
              </div>
            </div>
            

            
            {/* Simple Form */}
            <div className="max-w-md mx-auto relative z-20">
              <div className="bg-modal-bg rounded-lg shadow p-6">
                <form className="space-y-4" onSubmit={handleMainFormSubmit}>


                  
                  {/* Web app message */}
                  {!pwaState.isInstalled && (
                    <div className="text-center mb-6">
                      <p className="text-sm text-text-secondary mb-4">
                        Upload your pN file to unlock your pN
                      </p>
                    </div>
                  )}

                  {/* Identity Selector - Only show in PWA mode when there are stored identities */}
                  {pwaState.isInstalled && (
                    <div>
                      <IdentitySelector
                        selectedIdentity={selectedStoredIdentity}
                        onIdentitySelect={handleIdentitySelect}
                        onUploadNew={() => {
                          // Trigger file upload dialog
                          document.getElementById('file-upload')?.click();
                        }}
                        onCreateNew={() => setShowCreateForm(true)}

                        onDeleteIdentity={handleDeleteIdentity}
                      />
                      
                      {/* Show file upload option for PWA when no stored identities */}
                      {!selectedStoredIdentity && !mainForm.uploadFile && (
                        <div className="mt-4">
                          <label className="block text-sm font-medium text-text-primary mb-1">
                            Or Upload New pN File
                          </label>
                          
                          <div className="relative">
                            <input
                              type="file"
                              accept=".pn,.id,.json,.identity"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  setMainForm((prev: any) => ({ ...prev, uploadFile: file }));
                                  // Clear selected identity when uploading new file
                                  setSelectedStoredIdentity(null);
                                }
                              }}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                              id="file-upload-pwa"
                            />
                            <label
                              htmlFor="file-upload-pwa"
                              className="flex items-center justify-center w-full px-4 py-3 border-2 border-dashed border-input-border bg-input-bg rounded-lg cursor-pointer hover:border-primary transition-colors"
                            >
                              <div className="text-center">
                                <div className="text-2xl mb-2">↑</div>
                                <div className="text-sm text-text-primary font-medium">
                                  Upload new pN file
                                </div>
                                <div className="text-xs text-text-secondary mt-1">
                                  (.json files recommended)
                                </div>
                              </div>
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* File upload for web app or when no stored identities */}
                  {!pwaState.isInstalled && (
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1">
                        Upload pN File (Required)
                      </label>
                      
                      <div className="relative">
                        <input
                          type="file"
                          accept=".pn,.id,.json,.identity"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              setMainForm((prev: any) => ({ ...prev, uploadFile: file }));
                              // Clear selected identity when uploading new file
                              setSelectedStoredIdentity(null);
                            }
                          }}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          id="file-upload-web"
                        />
                        <label
                          htmlFor="file-upload-web"
                          className="flex items-center justify-center w-full px-4 py-3 border-2 border-dashed border-input-border bg-input-bg rounded-lg cursor-pointer hover:border-primary transition-colors"
                        >
                          <div className="text-center">
                            <div className="text-2xl mb-2">↑</div>
                            <div className="text-sm text-text-primary font-medium">
                              {mainForm.uploadFile ? mainForm.uploadFile.name : 'Tap to upload pN file'}
                            </div>
                            <div className="text-xs text-text-secondary mt-1">
                              (.json files recommended)
                            </div>
                          </div>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Physical key unlock options */}
                  <div className="flex gap-3">
                    {typeof window !== 'undefined' && 'showDirectoryPicker' in window && (
                      <button
                        type="button"
                        onClick={() => setShowUnlockFromUsbModal(true)}
                        className="flex-1 py-2 px-3 border border-border rounded-md hover:bg-secondary text-sm text-text-primary flex items-center justify-center gap-2"
                      >
                        <span>Read from USB</span>
                      </button>
                    )}
                    {hasNfcSupport && (
                      <button
                        type="button"
                        onClick={() => setShowUnlockFromNfcModal(true)}
                        className="flex-1 py-2 px-3 border border-border rounded-md hover:bg-secondary text-sm text-text-primary flex items-center justify-center gap-2"
                      >
                        <span>Tap NFC card</span>
                      </button>
                    )}
                  </div>
                  
                  {/* Key 1 — auto-filled if identity selected */}
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">
                      {KEY_1_LABEL}
                    </label>
                    <div className="relative">
                      <input
                        type={showMainPNName ? "text" : "password"}
                        value={mainForm.pnName || ''}
                        onChange={(e) => setMainForm((prev: any) => ({ ...prev, pnName: e.target.value }))}
                        className="w-full px-3 py-2 pr-10 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder={KEY_1_PLACEHOLDER}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowMainPNName(!showMainPNName)}
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 text-text-secondary hover:text-text-primary"
                      >
                        {showMainPNName ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">
                      {KEY_2_LABEL}
                    </label>
                    <div className="relative">
                      <input
                        type={showMainPasscode ? "text" : "password"}
                        value={mainForm.passcode || ''}
                        onChange={(e) => setMainForm((prev: any) => ({ ...prev, passcode: e.target.value }))}
                        className="w-full px-3 py-2 pr-10 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder={KEY_2_PLACEHOLDER}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowMainPasscode(!showMainPasscode)}
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 text-text-secondary hover:text-text-primary"
                      >
                        {showMainPasscode ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                          </svg>
                        )}
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-text-secondary">{KEYS_HELPER}</p>
                  </div>
                  
                  {/* Hidden file upload for when user chooses to upload new file */}
                  <input
                    type="file"
                    accept=".pn,.id,.json,.identity"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setMainForm((prev: any) => ({ ...prev, uploadFile: file }));
                        // Clear selected identity when uploading new file
                        setSelectedStoredIdentity(null);
                      }
                    }}
                    className="hidden"
                    id="file-upload"
                  />
                  
                  <div className="space-y-3">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full px-4 py-3 modal-button rounded-md font-medium text-lg shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-lg"
                  >
                    {loading ? 'Unlocking...' : 'Unlock pN'}
                  </button>
                    

                  </div>
                </form>
                
                <div className="mt-6 text-center">
                  <p className="text-sm text-text-secondary mb-3">Don&apos;t have a pN yet?</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCreateForm(true)}
                      className="flex-1 px-3 py-2 modal-button rounded-md text-sm font-medium"
                    >
                      Create New pN
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowRecoveryModal(true)}
                      className="flex-1 px-3 py-2 modal-button rounded-md text-sm font-medium"
                    >
                      Recover pN
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
    </>
  );
}
