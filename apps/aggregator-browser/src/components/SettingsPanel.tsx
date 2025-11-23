/**
 * Settings Panel Component
 * User preferences and settings management
 */

import React from 'react';
import { X, Shield, User, Bell, Globe } from 'lucide-react';
import { useUserState } from '../contexts/UserStateContext';
// RatingPreferences removed - will be replaced with NSFW toggle in Phase 7
import { PNConnect } from './PNConnect';

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { userState, setLocked } = useUserState();

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900 rounded-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-700">
          <h2 className="text-2xl font-bold text-white">Settings</h2>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Account Section */}
          <section>
            <div className="flex items-center space-x-2 mb-4">
              <User className="h-5 w-5 text-blue-400" />
              <h3 className="text-lg font-semibold text-white">Account</h3>
            </div>
            <div className="bg-neutral-800/50 rounded-lg p-4">
              {userState.isUnlocked ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-text-secondary text-sm mb-1">pN Status</p>
                    <p className="text-white font-medium">Connected</p>
                    <p className="text-text-secondary text-xs mt-1">
                      {userState.pnIdentifier}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setLocked();
                      onClose();
                    }}
                    className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
                  >
                    Disconnect pN
                  </button>
                </div>
              ) : (
                <div>
                  <p className="text-text-secondary text-sm mb-4">
                    Connect your pN to unlock engagement features and personalize your experience.
                  </p>
                  <PNConnect compact />
                </div>
              )}
            </div>
          </section>

          {/* Content Preferences - NSFW toggle will be added in Phase 7 */}
          {/* Removed rating preferences - replaced with simple NSFW toggle */}

          {/* Privacy & Safety */}
          <section>
            <div className="flex items-center space-x-2 mb-4">
              <Globe className="h-5 w-5 text-blue-400" />
              <h3 className="text-lg font-semibold text-white">Privacy & Safety</h3>
            </div>
            <div className="bg-neutral-800/50 rounded-lg p-4 space-y-4">
              <div>
                <p className="text-white text-sm mb-2">Age Verification</p>
                {userState.preferences.ageVerified ? (
                  <p className="text-text-secondary text-xs">
                    Verified age: {userState.preferences.verifiedAge}+
                  </p>
                ) : (
                  <p className="text-text-secondary text-xs">
                    Age verification required for 18+ content
                  </p>
                )}
              </div>
              <div>
                <p className="text-white text-sm mb-2">Content Filtering</p>
                <p className="text-text-secondary text-xs">
                  Content is filtered based on your rating preferences. You can adjust these settings above.
                </p>
              </div>
            </div>
          </section>

          {/* About */}
          <section>
            <div className="bg-neutral-800/50 rounded-lg p-4">
              <h4 className="text-white text-sm font-medium mb-2">About par Noir Browser</h4>
              <p className="text-text-secondary text-xs mb-2">
                A decentralized social media network built on peer-to-peer protocols.
                Your content, your control.
              </p>
              <p className="text-text-secondary text-xs">
                Version 1.0.0 • browse.parnoir.com
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

