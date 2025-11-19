/**
 * Profile Action Menu Component
 * Dropdown menu for profile actions with display name header and edit functionality
 */

import React, { useState, useEffect, useMemo } from 'react';
import { User, MessageCircle, UserPlus, Check, X, Clock, ChevronDown, Edit2, Save, X as XIcon, Pencil } from 'lucide-react';
import { useUserState } from '../contexts/UserStateContext';
import { getConnectionStatus, sendConnectionRequest, acceptConnectionRequest, rejectConnectionRequest } from '../services/connectionService';
import { ConnectionStatus } from '../services/connectionService';
import { useToast } from '../hooks/useToast';
import { decryptWithToken, ShareToken } from '../utils/tokenDecryption';
import { IndexedFile } from '../types/aggregator';
import { getUserProfile, updateDisplayName as updateDisplayNameAPI } from '../services/profileService';

interface ProfileActionMenuProps {
  creatorId: string;
  onViewProfile: () => void;
  onMessage?: (creatorId: string) => void;
  indexedFiles?: IndexedFile[]; // Optional: for loading profile images
  isOwner?: boolean; // Optional: whether this is the owner's profile
}

export function ProfileActionMenu({ creatorId, onViewProfile, onMessage, indexedFiles = [], isOwner = false }: ProfileActionMenuProps) {
  const { userState, getDisplayName, updateDisplayName, setUserDisplayName } = useUserState();
  const { success, error: showError } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({ status: 'not_connected' });
  const [loading, setLoading] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  const [profileImageLoading, setProfileImageLoading] = useState(false);
  const [profileImageFileId, setProfileImageFileId] = useState<string | null>(null);
  const [externalDisplayName, setExternalDisplayName] = useState<string | null>(null);

  // Helper to check if ID is a valid pN identifier (not a DID or public key)
  const isValidPnIdentifier = (id: string): boolean => {
    if (!id) return false;
    // Skip DIDs
    if (id.startsWith('did:key:')) return false;
    // Skip public keys (very long base64 strings, typically >200 chars)
    if (id.length > 200) return false;
    // Skip if it looks like a base64-encoded public key
    if (/^MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A/i.test(id)) return false;
    return true;
  };

  // Normalize identifiers for comparison (remove "pn-" prefix if present)
  const normalizeId = (id: string | undefined | null): string => {
    if (!id) return '';
    return id.startsWith('pn-') ? id.substring(3) : id;
  };
  
  const normalizedCreatorId = normalizeId(creatorId);
  const normalizedUserPnId = normalizeId(userState.pnIdentifier);
  
  // Use isOwner prop if provided, otherwise check if creatorId matches user's pN identifier
  const isOwnProfile = isOwner || (normalizedUserPnId && isValidPnIdentifier(creatorId) && normalizedCreatorId === normalizedUserPnId);

  // Get display name for this creator
  const displayName = useMemo(() => {
    // If we have an external display name from API, use it
    if (externalDisplayName) {
      return externalDisplayName;
    }
    // Otherwise use cached or default
    return getDisplayName(creatorId);
  }, [creatorId, externalDisplayName, userState.preferences.displayName, userState.preferences.userDisplayNames, userState.pnIdentifier, getDisplayName]);

  // Load profile data (display name and profile image fileId) from API
  useEffect(() => {
    if (!creatorId || !isValidPnIdentifier(creatorId)) return;

    const loadProfileData = async () => {
      try {
        const profile = await getUserProfile(creatorId);
        
        if (profile.displayName) {
          setExternalDisplayName(profile.displayName);
          // Cache it in user state
          setUserDisplayName(creatorId, profile.displayName);
        }
        
        if (profile.profileImageFileId) {
          setProfileImageFileId(profile.profileImageFileId);
        }
      } catch (error) {
        // Silently fail - profile may not exist for this user
        // Don't log to console to avoid spam
      }
    };

    loadProfileData();
  }, [creatorId, setUserDisplayName]);

  // Get profile image fileId (own profile from preferences, other users from API)
  const currentProfileImageFileId = useMemo(() => {
    if (isOwnProfile) {
      return userState.preferences.profileImageFileId || null;
    }
    return profileImageFileId;
  }, [isOwnProfile, userState.preferences.profileImageFileId, profileImageFileId]);

  // Load profile image
  useEffect(() => {
    if (!currentProfileImageFileId || indexedFiles.length === 0) {
      setProfileImageUrl(null);
      return;
    }

    const loadProfileImage = async () => {
      const profileFile = indexedFiles.find(f => f.metadata.fileId === currentProfileImageFileId);
      if (!profileFile || !profileFile.publicToken) {
        setProfileImageUrl(null);
        return;
      }

      // Check if it's an image
      const isImage = profileFile.metadata.fileType?.startsWith('image/') || 
                     profileFile.metadata.encodingFormat?.startsWith('image/');
      if (!isImage) {
        setProfileImageUrl(null);
        return;
      }

      setProfileImageLoading(true);
      try {
        const token: ShareToken = typeof profileFile.publicToken === 'string' 
          ? JSON.parse(profileFile.publicToken) 
          : profileFile.publicToken;
        
        const decryptedBlob = await decryptWithToken(token);
        const url = URL.createObjectURL(decryptedBlob);
        setProfileImageUrl(url);
      } catch (error) {
        console.error('Failed to load profile image:', error);
        setProfileImageUrl(null);
      } finally {
        setProfileImageLoading(false);
      }
    };

    loadProfileImage();
  }, [currentProfileImageFileId, indexedFiles]);

  // Clean up object URL
  useEffect(() => {
    return () => {
      if (profileImageUrl) {
        URL.revokeObjectURL(profileImageUrl);
      }
    };
  }, [profileImageUrl]);

  // Initialize edit name value
  useEffect(() => {
    if (isEditingName) {
      setEditNameValue(displayName);
    }
  }, [isEditingName, displayName]);

  // Load connection status
  useEffect(() => {
    if (!userState.isUnlocked || !userState.pnIdentifier || isOwnProfile || !creatorId || !isValidPnIdentifier(creatorId)) {
      setConnectionStatus({ status: 'not_connected' });
      return;
    }

    const loadStatus = async () => {
      try {
        const status = await getConnectionStatus(userState.pnIdentifier!, creatorId);
        setConnectionStatus(status);
      } catch (error) {
        // Silently fail - user may not have connections set up
        // Don't log to console to avoid spam
        setConnectionStatus({ status: 'not_connected' });
      }
    };

    loadStatus();
  }, [userState.isUnlocked, userState.pnIdentifier, creatorId, isOwnProfile]);

  // Close menu when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-profile-menu]')) {
        setIsOpen(false);
        setIsEditingName(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleConnect = async () => {
    if (!userState.isUnlocked || !userState.pnIdentifier) return;

    setLoading(true);
    try {
      await sendConnectionRequest(userState.pnIdentifier, creatorId);
      setConnectionStatus({ status: 'pending_sent' });
      success('Connection request sent!');
      setIsOpen(false);
    } catch (error: any) {
      showError(error.message || 'Failed to send connection request');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!userState.isUnlocked || !userState.pnIdentifier || !connectionStatus.connectionId) return;

    setLoading(true);
    try {
      await acceptConnectionRequest(connectionStatus.connectionId, userState.pnIdentifier);
      setConnectionStatus({ status: 'connected', connectionId: connectionStatus.connectionId });
      success('Connection accepted!');
      setIsOpen(false);
    } catch (error: any) {
      showError(error.message || 'Failed to accept connection request');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!userState.isUnlocked || !userState.pnIdentifier || !connectionStatus.connectionId) return;

    setLoading(true);
    try {
      await rejectConnectionRequest(connectionStatus.connectionId, userState.pnIdentifier);
      setConnectionStatus({ status: 'not_connected' });
      setIsOpen(false);
    } catch (error: any) {
      showError(error.message || 'Failed to reject connection request');
    } finally {
      setLoading(false);
    }
  };

  const handleMessage = () => {
    if (onMessage) {
      onMessage(creatorId);
    }
    setIsOpen(false);
  };

  const handleSaveDisplayName = async () => {
    const newDisplayName = editNameValue.trim() || creatorId.substring(0, 8);
    
    if (isOwnProfile) {
      // Update own display name - save to Google Drive via API and local state
      try {
        setLoading(true);
        if (userState.pnIdentifier) {
          await updateDisplayNameAPI(userState.pnIdentifier, newDisplayName);
        }
        updateDisplayName(newDisplayName);
        setIsEditingName(false);
        success('Display name updated!');
      } catch (error: any) {
        showError(error.message || 'Failed to update display name');
      } finally {
        setLoading(false);
      }
    } else {
      // For other users, just cache locally
      setUserDisplayName(creatorId, newDisplayName);
      setIsEditingName(false);
      success('Display name updated!');
    }
  };

  const handleCancelEdit = () => {
    setIsEditingName(false);
    setEditNameValue(displayName);
  };

  // Get connection action button
  const getActionButton = () => {
    if (connectionStatus.status === 'connected') {
      return (
        <button
          onClick={handleMessage}
          disabled={loading}
          className="flex items-center space-x-2 px-4 py-2 text-white hover:bg-neutral-700 rounded-lg transition-colors w-full text-left disabled:opacity-50"
        >
          <MessageCircle className="h-4 w-4" />
          <span>Message</span>
        </button>
      );
    }

    if (connectionStatus.status === 'pending_sent') {
      return (
        <div className="flex items-center space-x-2 px-4 py-2 text-neutral-400 w-full">
          <Clock className="h-4 w-4" />
          <span>Pending</span>
        </div>
      );
    }

    if (connectionStatus.status === 'pending_received') {
      return (
        <div className="flex flex-col space-y-1 w-full">
          <button
            onClick={handleAccept}
            disabled={loading}
            className="flex items-center space-x-2 px-4 py-2 text-green-400 hover:bg-neutral-700 rounded-lg transition-colors w-full text-left disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            <span>Accept</span>
          </button>
          <button
            onClick={handleReject}
            disabled={loading}
            className="flex items-center space-x-2 px-4 py-2 text-red-400 hover:bg-neutral-700 rounded-lg transition-colors w-full text-left disabled:opacity-50"
          >
            <X className="h-4 w-4" />
            <span>Reject</span>
          </button>
        </div>
      );
    }

    // Not connected
    return (
      <button
        onClick={handleConnect}
        disabled={loading || !userState.isUnlocked}
        className="flex items-center space-x-2 px-4 py-2 text-white hover:bg-neutral-700 rounded-lg transition-colors w-full text-left disabled:opacity-50"
      >
        <UserPlus className="h-4 w-4" />
        <span>Connect</span>
      </button>
    );
  };

  return (
    <div className="relative" data-profile-menu>
      <button
        onClick={(e) => {
          console.log('🔍 Profile button clicked', { isOpen });
          e.stopPropagation();
          e.preventDefault();
          setIsOpen(!isOpen);
          console.log('🔍 setIsOpen called with:', !isOpen);
        }}
        className="flex flex-col items-center space-y-1 group cursor-pointer"
        title="Profile actions"
        type="button"
      >
        <div className="relative w-12 h-12 md:w-14 md:h-14 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center group-hover:bg-black/50 active:bg-black/70 transition-colors touch-manipulation overflow-hidden">
          {profileImageUrl && !profileImageLoading ? (
            <img 
              src={profileImageUrl} 
              alt={displayName}
              className="w-full h-full object-cover"
            />
          ) : (
            <User className="h-6 w-6 md:h-7 md:w-7 text-white group-hover:text-blue-400 transition-colors" />
          )}
          <ChevronDown className="absolute bottom-0 right-0 h-3 w-3 text-white/70 bg-black/50 rounded-full p-0.5" />
        </div>
      </button>

      {isOpen && (
        <div className="absolute left-full top-0 ml-2 w-56 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl overflow-hidden z-50">
          {/* Header with Display Name */}
          <div className="px-4 py-3 border-b border-neutral-700">
            {isEditingName && isOwnProfile ? (
              <div className="flex items-center space-x-2">
                {/* Profile Icon */}
                <div className="w-8 h-8 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {profileImageUrl && !profileImageLoading ? (
                    <img 
                      src={profileImageUrl} 
                      alt={displayName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="h-4 w-4 text-white" />
                  )}
                </div>
                <input
                  type="text"
                  value={editNameValue}
                  onChange={(e) => setEditNameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSaveDisplayName();
                    } else if (e.key === 'Escape') {
                      handleCancelEdit();
                    }
                  }}
                  className="flex-1 px-2 py-1 bg-neutral-700 text-white rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  autoFocus
                  maxLength={50}
                />
                <button
                  onClick={handleSaveDisplayName}
                  className="p-1 text-green-400 hover:bg-neutral-700 rounded transition-colors"
                  title="Save"
                >
                  <Save className="h-4 w-4" />
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="p-1 text-red-400 hover:bg-neutral-700 rounded transition-colors"
                  title="Cancel"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {/* Profile Icon */}
                <div className="w-8 h-8 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {profileImageUrl && !profileImageLoading ? (
                    <img 
                      src={profileImageUrl} 
                      alt={displayName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="h-4 w-4 text-white" />
                  )}
                </div>
                <div className="flex items-center space-x-1.5 min-w-0 flex-1">
                  <span className="text-white font-medium text-sm truncate">{displayName}</span>
                  {isOwnProfile && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setIsEditingName(true);
                      }}
                      className="p-0.5 text-neutral-400 hover:text-white hover:bg-neutral-700 rounded transition-colors flex-shrink-0"
                      title="Edit display name"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Connection/Message Actions */}
          {!isOwnProfile && (
            <div className="border-b border-neutral-700">
              {getActionButton()}
            </div>
          )}

          {/* Go to Profile */}
          <button
            onClick={onViewProfile}
            className="flex items-center space-x-2 px-4 py-2 text-white hover:bg-neutral-700 transition-colors w-full text-left"
          >
            <User className="h-4 w-4" />
            <span>Go to Profile</span>
          </button>
        </div>
      )}
    </div>
  );
}
