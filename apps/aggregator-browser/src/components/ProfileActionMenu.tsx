/**
 * Profile Action Menu Component
 * Dropdown menu for profile actions with display name header and edit functionality
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { User, MessageCircle, UserPlus, Check, X, Clock, Pencil, UserMinus } from 'lucide-react';
import { useUserState } from '../contexts/UserStateContext';
import { getConnectionStatus, sendConnectionRequest, acceptConnectionRequest, rejectConnectionRequest, removeConnection } from '../services/connectionService';
import { ConnectionStatus } from '../services/connectionService';
import { useToast } from '../hooks/useToast';
import {
  ensureLocalMessagingKeysForAccept,
  reportConnectionAcceptError,
} from '../services/messagingReconnect';
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

export const ProfileActionMenu = React.memo(function ProfileActionMenu({ creatorId, onViewProfile, onMessage, indexedFiles = [], isOwner = false }: ProfileActionMenuProps) {
  const { userState, getDisplayName, updateDisplayName, setUserDisplayName } = useUserState();
  const { success, error: showError } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

  // Update menu position when it opens - position to the LEFT of the button
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.top,
        left: rect.left - 224 - 8 // 224px is menu width (w-56 = 14rem = 224px), 8px margin
      });
    }
  }, [isOpen]);

  // Handle clicks outside the menu
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      // Don't close if clicking on menu or button
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) {
        return;
      }
      // Don't close if clicking on container (which includes button)
      if (containerRef.current && !containerRef.current.contains(target)) {
        console.log('🔍 Clicked outside, closing menu');
        setIsOpen(false);
      }
    };

    // Delay to avoid immediate closure
    const timeout = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 300);

    return () => {
      clearTimeout(timeout);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({ status: 'not_connected' });
  const [loading, setLoading] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  const [profileImageLoading, setProfileImageLoading] = useState(false);
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

  // Load profile data (display name) from API
  // Note: Profile image now comes from top post, not profileImageFileId
  // Track which profiles we've already loaded to prevent re-fetching
  const loadedProfilesRef = useRef<Set<string>>(new Set());
  
  useEffect(() => {
    if (!creatorId || !isValidPnIdentifier(creatorId)) return;
    
    // Skip if we've already loaded this profile
    if (loadedProfilesRef.current.has(creatorId)) {
      return;
    }

    const loadProfileData = async () => {
      try {
        const profile = await getUserProfile(creatorId);
        
        // Mark as loaded
        loadedProfilesRef.current.add(creatorId);
        
        if (profile.displayName) {
          setExternalDisplayName(profile.displayName);
          // Cache it in user state
          setUserDisplayName(creatorId, profile.displayName);
        }
      } catch (error) {
        // Silently fail - profile may not exist for this user
        // Don't log to console to avoid spam
      }
    };

    loadProfileData();
  }, [creatorId]); // Removed setUserDisplayName from deps - it's stable from context

  // Create a stable key for indexedFiles based on fileIds to prevent unnecessary recalculations
  const indexedFilesKey = useMemo(() => {
    return indexedFiles.map(f => f.metadata.fileId).sort().join(',');
  }, [indexedFiles]);

  // Find top post file for profile icon (replaces profileImageFileId)
  // Only recalculate when indexedFilesKey or creatorId changes, not on every indexedFiles reference change
  // Use a ref to cache the result and only recalculate when indexedFilesKey actually changes
  const topPostFileRef = useRef<IndexedFile | null>(null);
  const lastIndexedFilesKeyRef = useRef<string>('');
  const lastCreatorIdRef = useRef<string>('');
  
  const topPostFile = useMemo(() => {
    // If indexedFilesKey and creatorId haven't changed, return cached result
    if (indexedFilesKey === lastIndexedFilesKeyRef.current && 
        normalizedCreatorId === lastCreatorIdRef.current &&
        topPostFileRef.current !== null) {
      return topPostFileRef.current;
    }
    
    if (indexedFiles.length === 0) {
      topPostFileRef.current = null;
      lastIndexedFilesKeyRef.current = indexedFilesKey;
      lastCreatorIdRef.current = normalizedCreatorId;
      return null;
    }
    
    // Find file where isTopPost === true for this creator
    const topPost = indexedFiles.find(f => {
      // PRIMARY: Use top-level pnIdentifier field first, then fallback to metadata fields
      const fileCreatorId = (f as any).pnIdentifier ||
                            f.metadata.creator?.identifier?.value || 
                            f.metadata.creator?.["@id"] ||
                            f.metadata.author?.did ||
                            (f.metadata as any).creatorId;
      const normalizedFileCreatorId = normalizeId(fileCreatorId);
      const isTopPost = f.metadata.isTopPost === true;
      const matches = normalizedFileCreatorId === normalizedCreatorId;
      
      return matches && isTopPost;
    });
    
    const result = topPost || null;
    topPostFileRef.current = result;
    lastIndexedFilesKeyRef.current = indexedFilesKey;
    lastCreatorIdRef.current = normalizedCreatorId;
    return result;
  }, [indexedFilesKey, normalizedCreatorId, creatorId, indexedFiles]);

  // Load profile image from top post
  // Use a ref to track the last processed fileId to prevent re-processing the same file
  const lastProcessedFileIdRef = useRef<string | null>(null);
  
  useEffect(() => {
    if (!topPostFile) {
      if (lastProcessedFileIdRef.current !== null) {
        setProfileImageUrl(null);
        lastProcessedFileIdRef.current = null;
      }
      return;
    }
    
    const fileId = topPostFile.metadata.fileId;
    
    // Skip if we've already processed this file
    if (lastProcessedFileIdRef.current === fileId) {
      return;
    }
    
    // Check for publicToken at IndexedFile level or in metadata
    const publicToken = topPostFile.publicToken || topPostFile.metadata.publicToken;
    
    if (!publicToken) {
      setProfileImageUrl(null);
      lastProcessedFileIdRef.current = fileId; // Mark as processed even if no token
      return;
    }

    const loadProfileImage = async () => {
      // Check if it's an image, video, or thought (thoughts are rendered as PNG images)
      // Handle both MIME types (image/jpeg) and simple types (image)
      const fileType = topPostFile.metadata.fileType || '';
      const encodingFormat = topPostFile.metadata.encodingFormat || '';
      
      // Check if it's a thought (text post) - these are rendered as PNG images
      const isThought = fileType === 'text' || 
                       fileType === 'thought' ||
                       !!(topPostFile.metadata as any).textPost ||
                       !!(topPostFile.metadata as any).thought;
      
      const isImage = fileType.startsWith('image/') || 
                     fileType === 'image' ||
                     encodingFormat.startsWith('image/') ||
                     encodingFormat === 'image';
      const isVideo = fileType.startsWith('video/') || 
                     fileType === 'video' ||
                     encodingFormat.startsWith('video/') ||
                     encodingFormat === 'video';
      
      // Thoughts are stored as PNG images, so treat them as images
      if (!isImage && !isVideo && !isThought) {
        setProfileImageUrl(null);
        lastProcessedFileIdRef.current = fileId;
        return;
      }

      setProfileImageLoading(true);
      try {
        const token: ShareToken = typeof publicToken === 'string' 
          ? JSON.parse(publicToken) 
          : publicToken;
        
        if (isImage || isThought) {
          // Thoughts are rendered as PNG images, so decrypt and use them
          const decryptedBlob = await decryptWithToken(token);
          const url = URL.createObjectURL(decryptedBlob);
          setProfileImageUrl(url);
          lastProcessedFileIdRef.current = fileId; // Mark as processed
        } else if (isVideo) {
          // For videos, we'd ideally use a thumbnail, but for now we'll skip
          // In the future, we could generate/extract a thumbnail
          setProfileImageUrl(null);
          lastProcessedFileIdRef.current = fileId;
        }
      } catch (error) {
        // Silently fail - don't log to avoid console spam
        setProfileImageUrl(null);
        lastProcessedFileIdRef.current = fileId;
      } finally {
        setProfileImageLoading(false);
      }
    };

    loadProfileImage();
  }, [topPostFile]);

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
        if (isEditingName) {
          setIsEditingName(false);
          setEditNameValue(displayName); // Reset to original value
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, isEditingName, displayName]);

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

    const keysError = ensureLocalMessagingKeysForAccept();
    if (keysError) {
      showError(keysError);
      return;
    }

    setLoading(true);
    try {
      await acceptConnectionRequest(
        connectionStatus.connectionId,
        userState.pnIdentifier,
        creatorId
      );
      setConnectionStatus({ status: 'connected', connectionId: connectionStatus.connectionId });
      success('Connection accepted!');
      setIsOpen(false);
    } catch (error: unknown) {
      const message = reportConnectionAcceptError(error, undefined, {
        requesterPnIdentifier: creatorId,
      });
      showError(message);
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

  const handleDisconnect = async () => {
    if (!userState.isUnlocked || !userState.pnIdentifier || !connectionStatus.connectionId) return;

    setLoading(true);
    try {
      await removeConnection(connectionStatus.connectionId, userState.pnIdentifier);
      setConnectionStatus({ status: 'not_connected' });
      success('Disconnected');
      setIsOpen(false);
    } catch (error: any) {
      showError(error.message || 'Failed to disconnect');
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
    const newDisplayName = editNameValue.trim();
    
    if (!newDisplayName) {
      showError('Display name cannot be empty');
      return;
    }
    
    if (isOwnProfile) {
      // Update own display name - save to Google Drive via API and local state
      try {
        setLoading(true);
        if (userState.pnIdentifier) {
          await updateDisplayNameAPI(userState.pnIdentifier, newDisplayName);
        }
        updateDisplayName(newDisplayName); // Update local state
        setUserDisplayName(creatorId, newDisplayName); // Cache it
        setIsEditingName(false);
        success('Display name updated!');
      } catch (error: any) {
        console.error('Failed to update display name:', error);
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

  // Get connection action button
  const getActionButton = () => {
    if (connectionStatus.status === 'connected') {
      return (
        <div className="flex flex-col space-y-1 w-full">
          <button
            onClick={handleMessage}
            disabled={loading}
            className="flex items-center space-x-2 px-4 py-2 text-white hover:bg-neutral-700 rounded-lg transition-colors w-full text-left disabled:opacity-50"
          >
            <MessageCircle className="h-4 w-4" />
            <span>Message</span>
          </button>
          <button
            onClick={handleDisconnect}
            disabled={loading}
            className="flex items-center space-x-2 px-4 py-2 text-red-400 hover:bg-neutral-700 rounded-lg transition-colors w-full text-left disabled:opacity-50"
          >
            <UserMinus className="h-4 w-4" />
            <span>Disconnect</span>
          </button>
        </div>
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
    <div ref={containerRef} className="relative" data-profile-menu style={{ zIndex: 9999 }}>
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          console.log('🔍 Profile button clicked, current isOpen:', isOpen);
          setIsOpen(prev => {
            const newState = !prev;
            console.log('🔍 Setting isOpen to:', newState);
            return newState;
          });
        }}
        className="flex flex-col items-center space-y-1 group cursor-pointer"
        title="Profile actions"
        type="button"
      >
        <div className="relative w-12 h-12 md:w-14 md:h-14 rounded-full overflow-hidden flex items-center justify-center border-2 border-white/20 touch-manipulation bg-black/15" style={{ filter: 'drop-shadow(0 2px 6px rgba(0, 0, 0, 0.6))' }}>
          {profileImageUrl && !profileImageLoading ? (
            <img 
              src={profileImageUrl} 
              alt={displayName}
              className="w-full h-full object-cover"
            />
          ) : (
            <User className="h-6 w-6 md:h-7 md:w-7 text-white fill-white" />
          )}
        </div>
      </button>

      {isOpen && createPortal(
        <div 
          ref={menuRef}
          className="fixed w-56 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl overflow-hidden z-[99999]"
          style={{ 
            top: `${menuPosition.top}px`,
            left: `${menuPosition.left}px`,
            position: 'fixed',
            display: 'block',
            visibility: 'visible',
            opacity: 1,
            zIndex: 99999,
            pointerEvents: 'auto'
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
          }}
        >
            {/* Header with Display Name */}
          <div className="px-4 py-3 border-b border-neutral-700 min-h-[60px]">
            {isEditingName && isOwnProfile ? (
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
                {/* Text Input with Checkmark */}
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={editNameValue}
                    onChange={(e) => setEditNameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (editNameValue.trim()) {
                          handleSaveDisplayName();
                        }
                      } else if (e.key === 'Escape') {
                        setIsEditingName(false);
                        setEditNameValue(displayName);
                      }
                    }}
                    className="w-full px-3 pr-10 py-2 bg-neutral-800 text-white rounded-lg border border-neutral-700 focus:border-blue-500 focus:outline-none text-sm"
                    autoFocus
                    maxLength={50}
                    placeholder="Enter platform name..."
                  />
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleSaveDisplayName();
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-white hover:text-blue-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={!editNameValue.trim() || loading}
                    title="Save"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                </div>
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
            type="button"
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              console.log('🔍 Go to Profile clicked, calling onViewProfile');
              setIsOpen(false); // Close menu first
              // Small delay to ensure menu closes before navigation
              setTimeout(() => {
                console.log('🔍 Calling onViewProfile now');
                onViewProfile();
              }, 100);
            }}
            className="flex items-center space-x-2 px-4 py-2 text-white hover:bg-neutral-700 transition-colors w-full text-left cursor-pointer"
            style={{ pointerEvents: 'auto' }}
          >
            <User className="h-4 w-4" />
            <span>Go to Profile</span>
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function to prevent re-renders when props haven't meaningfully changed
  // Compare creatorId, isOwner, and indexedFiles length/fileIds
  if (prevProps.creatorId !== nextProps.creatorId) return false;
  if (prevProps.isOwner !== nextProps.isOwner) return false;
  if (prevProps.onViewProfile !== nextProps.onViewProfile) return false;
  if (prevProps.onMessage !== nextProps.onMessage) return false;
  
  // Compare indexedFiles by fileIds, not reference
  const prevFileIds = (prevProps.indexedFiles || []).map(f => f.metadata.fileId).sort().join(',');
  const nextFileIds = (nextProps.indexedFiles || []).map(f => f.metadata.fileId).sort().join(',');
  if (prevFileIds !== nextFileIds) return false;
  
  // Props are equal, skip re-render
  return true;
});
