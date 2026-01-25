/**
 * Message Thread Component
 * Conversation view for messaging
 */

import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Send, Image as ImageIcon, Paperclip, MoreVertical, Trash2, Check } from 'lucide-react';
import { Message } from '../services/messageService';
import { useUserState } from '../contexts/UserStateContext';
import { getConversationMessages, sendMessage, markAsRead, deleteConversation } from '../services/messageService';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from './Toast';

interface MessageThreadProps {
  participantPnIdentifier: string;
  participantName?: string;
  preloadedMessages?: Message[];
  onBack: () => void;
}

export function MessageThread({ participantPnIdentifier, participantName, preloadedMessages, onBack }: MessageThreadProps) {
  const { userState } = useUserState();
  const { error: showError, toasts, removeToast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalMessages, setTotalMessages] = useState(0);
  const [sending, setSending] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const isPollingRef = useRef(false);
  const errorCountRef = useRef(0);
  const currentOffsetRef = useRef(0);

  // Load messages
  useEffect(() => {
    if (!userState.isUnlocked || !userState.pnIdentifier) return;

    const loadMessages = async (isInitial = false, loadMore = false) => {
      // Prevent duplicate requests
      if (isPollingRef.current && !isInitial && !loadMore) {
        return; // Already polling, skip this request
      }

      if (loadMore) {
        setLoadingMore(true);
      } else if (isInitial) {
        setLoading(true);
      } else {
        isPollingRef.current = true;
      }
      
      try {
        const limit = 10;
        const offset = loadMore ? currentOffsetRef.current : 0;
        
        // Use preloaded messages if available (only on initial load)
        let result: { messages: Message[]; total: number };
        if (isInitial && preloadedMessages && preloadedMessages.length > 0) {
          result = { messages: preloadedMessages, total: preloadedMessages.length };
          // Still fetch in background to get latest messages
          getConversationMessages(userState.pnIdentifier!, participantPnIdentifier, limit, 0)
            .then(latestResult => {
              setTotalMessages(latestResult.total);
              const reversedMessages = [...latestResult.messages].reverse();
              const tempMessages = messages.filter(msg => msg.messageId.startsWith('temp-'));
              const existingMessageIds = new Set(reversedMessages.map(m => m.messageId));
              const preservedTempMessages = tempMessages.filter(msg => !existingMessageIds.has(msg.messageId));
              const allMessages = [...reversedMessages, ...preservedTempMessages];
              allMessages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
              setMessages(allMessages);
              currentOffsetRef.current = reversedMessages.length;
              setHasMore(reversedMessages.length < latestResult.total);
            })
            .catch(() => {
              // Ignore errors - we already have preloaded messages
            });
        } else {
          result = await getConversationMessages(userState.pnIdentifier!, participantPnIdentifier, limit, offset);
        }
        
        // Reset error count on success
        errorCountRef.current = 0;
        setTotalMessages(result.total);
        
        // Reverse messages to show oldest first (chat order) - API returns newest first
        const reversedMessages = [...result.messages].reverse();
        
        if (loadMore) {
          // Prepend older messages
          const existingMessageIds = new Set(messages.map(m => m.messageId));
          const newMessages = reversedMessages.filter(m => !existingMessageIds.has(m.messageId));
          setMessages(prev => [...newMessages, ...prev]);
          currentOffsetRef.current += reversedMessages.length;
          setHasMore(currentOffsetRef.current < result.total);
        } else {
          // Replace messages (initial load or refresh)
          const tempMessages = messages.filter(msg => msg.messageId.startsWith('temp-'));
          const existingMessageIds = new Set(reversedMessages.map(m => m.messageId));
          const preservedTempMessages = tempMessages.filter(msg => !existingMessageIds.has(msg.messageId));
          
          // Combine fetched messages with preserved temporary messages
          const allMessages = [...reversedMessages, ...preservedTempMessages];
          // Sort by timestamp to maintain order
          allMessages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          
          setMessages(allMessages);
          currentOffsetRef.current = reversedMessages.length;
          setHasMore(reversedMessages.length < result.total);
        }

        // Mark unread messages as read
        const unreadMessages = result.messages.filter(m => !m.read && m.toPnIdentifier === userState.pnIdentifier);
        for (const message of unreadMessages) {
          try {
            await markAsRead(message.messageId, userState.pnIdentifier!, participantPnIdentifier);
          } catch (error) {
            console.error('Failed to mark as read:', error);
          }
        }
      } catch (error) {
        // Increment error count
        errorCountRef.current += 1;
        
        // On network errors, preserve existing messages (don't clear them)
        // Only log the error - don't update state
        const errorMessage = error instanceof Error ? error.message : 'Failed to load messages';
        // Only log network errors, don't show to user for polling failures
        if (errorMessage.includes('Failed to fetch') || errorMessage.includes('ERR_NETWORK')) {
          console.warn('Network error while loading messages, preserving existing messages:', errorMessage);
        } else {
          console.error('Failed to load messages:', error);
        }
        // Don't update messages on error - preserve what we have
      } finally {
        if (loadMore) {
          setLoadingMore(false);
        } else if (isInitial) {
          setLoading(false);
        } else {
          isPollingRef.current = false;
        }
      }
    };

    // Initial load - use preloaded messages if available
    if (preloadedMessages && preloadedMessages.length > 0) {
      // Use preloaded messages immediately
      const reversedMessages = [...preloadedMessages].reverse();
      setMessages(reversedMessages);
      setTotalMessages(preloadedMessages.length);
      currentOffsetRef.current = reversedMessages.length;
      setHasMore(reversedMessages.length < preloadedMessages.length);
      setLoading(false);
      // Fetch latest in background
      loadMessages(false, false);
    } else {
      loadMessages(true, false);
    }

    // Poll for new messages - only when tab is visible, with exponential backoff on errors
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && !isPollingRef.current) {
        // Stop polling if too many consecutive errors
        if (errorCountRef.current >= 3) {
          console.warn('Too many polling errors, stopping automatic refresh');
          return;
        }
        loadMessages(false, false);
      }
    }, 15000); // 15 seconds instead of 5
    
    return () => clearInterval(interval);
  }, [userState.isUnlocked, userState.pnIdentifier, participantPnIdentifier, preloadedMessages]);

  // Auto-scroll to bottom when messages change (but not when loading more)
  useEffect(() => {
    if (!loadingMore && messagesContainerRef.current) {
      const container = messagesContainerRef.current;
      // Only auto-scroll if we're near the bottom (within 100px)
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      if (isNearBottom) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [messages, loadingMore]);

  // Scroll detection for loading older messages
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || !hasMore || loadingMore || !userState.pnIdentifier) return;

    const handleScroll = () => {
      // Load more when scrolled to top (within 200px)
      if (container.scrollTop < 200 && hasMore && !loadingMore && !isPollingRef.current) {
        const loadMoreMessages = async () => {
          const limit = 10;
          const offset = currentOffsetRef.current;
          
          setLoadingMore(true);
          try {
            const result = await getConversationMessages(userState.pnIdentifier!, participantPnIdentifier, limit, offset);
            const reversedMessages = [...result.messages].reverse();
            
            // Preserve scroll position
            const previousScrollHeight = container.scrollHeight;
            const previousScrollTop = container.scrollTop;
            
            // Prepend older messages
            const existingMessageIds = new Set(messages.map(m => m.messageId));
            const newMessages = reversedMessages.filter(m => !existingMessageIds.has(m.messageId));
            setMessages(prev => [...newMessages, ...prev]);
            
            // Restore scroll position after DOM update
            setTimeout(() => {
              const newScrollHeight = container.scrollHeight;
              container.scrollTop = previousScrollTop + (newScrollHeight - previousScrollHeight);
            }, 0);
            
            currentOffsetRef.current += reversedMessages.length;
            setHasMore(currentOffsetRef.current < result.total);
          } catch (error) {
            console.error('Failed to load older messages:', error);
          } finally {
            setLoadingMore(false);
          }
        };
        
        loadMoreMessages();
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [hasMore, loadingMore, userState.pnIdentifier, participantPnIdentifier, messages]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);

  const handleSend = async () => {
    if (!newMessage.trim() || !userState.isUnlocked || !userState.pnIdentifier || sending) {
      return;
    }

    const content = newMessage.trim();
    setNewMessage('');
    setSending(true);

    // Create optimistic message immediately
    const tempMessageId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const optimisticMessage: Message = {
      messageId: tempMessageId,
      fromPnIdentifier: userState.pnIdentifier!,
      toPnIdentifier: participantPnIdentifier,
      content: content,
      timestamp: new Date().toISOString(),
      read: false
    };

    // Add optimistic message to UI immediately
    setMessages(prev => [...prev, optimisticMessage]);
    
    // Scroll to bottom to show the new message
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 0);

    try {
      const sentMessage = await sendMessage(
        userState.pnIdentifier!,
        participantPnIdentifier,
        content
      );
      
      // Replace optimistic message with server response
      setMessages(prev => prev.map(msg => 
        msg.messageId === tempMessageId ? sentMessage : msg
      ));
    } catch (error: any) {
      console.error('Failed to send message:', error);
      
      // Remove optimistic message on error
      setMessages(prev => prev.filter(msg => msg.messageId !== tempMessageId));
      
      // Extract error message from API response if available
      let errorMessage = 'Failed to send message';
      if (error?.message) {
        errorMessage = error.message;
      } else if (error?.error_description) {
        errorMessage = error.error_description;
      } else if (error?.error) {
        errorMessage = error.error;
      }
      showError(errorMessage);
      setNewMessage(content); // Restore message on error
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleDeleteConversation = async () => {
    if (!userState.isUnlocked || !userState.pnIdentifier || deleting) {
      return;
    }

    setDeleting(true);
    try {
      await deleteConversation(userState.pnIdentifier, participantPnIdentifier);
      // Navigate back to message list after successful deletion
      onBack();
    } catch (error: any) {
      console.error('Failed to delete conversation:', error);
      const errorMessage = error?.message || 'Failed to delete conversation';
      showError(errorMessage);
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
      setShowMenu(false);
    }
  };

  const displayName = participantName || (participantPnIdentifier?.substring(0, 16) || 'Unknown') + '...';

  return (
    <div className="h-full flex flex-col bg-neutral-900">
      <ToastContainer toasts={toasts} onClose={removeToast} />
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-neutral-700">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
            className="text-neutral-400 hover:text-white transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="text-neutral-400 hover:text-white transition-colors p-2"
              aria-label="Menu"
            >
              <MoreVertical className="h-5 w-5" />
            </button>
            {showMenu && (
              <div className="absolute left-0 mt-2 w-48 bg-neutral-800 border border-neutral-700 rounded-lg shadow-lg z-10">
                <button
                  onClick={() => {
                    setShowMenu(false);
                    setShowDeleteConfirm(true);
                  }}
                  className="w-full text-left px-4 py-2 text-red-400 hover:bg-neutral-700 flex items-center space-x-2"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Delete Conversation</span>
                </button>
              </div>
            )}
          </div>
          <div>
            <h2 className="text-white font-semibold">{displayName}</h2>
            <p className="text-neutral-400 text-xs">{participantPnIdentifier}</p>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-neutral-800 rounded-lg p-6 max-w-md w-full mx-4 border border-neutral-700">
            <h3 className="text-white font-semibold text-lg mb-2">Delete Conversation</h3>
            <p className="text-neutral-400 text-sm mb-6">
              Are you sure you want to delete this conversation? This will disconnect you from this user and you will no longer see this conversation. The other user will still be able to see the conversation on their end.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setShowMenu(false);
                }}
                className="px-4 py-2 text-neutral-400 hover:text-white transition-colors"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConversation}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mx-auto mb-2"></div>
            <p className="text-neutral-400 text-sm">Loading messages...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-neutral-400">No messages yet. Start the conversation!</p>
          </div>
        ) : (
          <>
            {loadingMore && (
              <div className="text-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-400 mx-auto mb-2"></div>
                <p className="text-neutral-400 text-xs">Loading older messages...</p>
              </div>
            )}
            {messages.map((message) => {
            const isOwn = message.fromPnIdentifier === userState.pnIdentifier;
            const isTemporary = message.messageId.startsWith('temp-');
            
            return (
              <div
                key={message.messageId}
                className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[70%] rounded-lg px-4 py-2 ${
                    isOwn
                      ? 'bg-blue-600 text-white'
                      : 'bg-neutral-800 text-white'
                  } ${isTemporary ? 'opacity-75' : ''}`}
                >
                  <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                  {message.mediaFileId && (
                    <div className="mt-2 p-2 bg-black/20 rounded">
                      <ImageIcon className="h-4 w-4 inline mr-2" />
                      <span className="text-xs">Media attached</span>
                    </div>
                  )}
                  <div className="flex items-center justify-end space-x-1 mt-1">
                    <p className={`text-xs ${
                      isOwn ? 'text-blue-100' : 'text-neutral-400'
                    }`}>
                      {isTemporary && '⏳ '}
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </p>
                    {isOwn && !isTemporary && (
                      <div className="flex items-center">
                        {message.read && message.readAt ? (
                          // Read: "READ" text
                          <span className="text-xs text-blue-200 ml-1">READ</span>
                        ) : message.read ? (
                          // Received: Double overlapping checkmarks
                          <div className="relative">
                            <Check className="h-3 w-3 text-blue-200" />
                            <Check className="h-3 w-3 text-blue-200 absolute -right-0.5 -top-0.5" style={{ opacity: 0.7 }} />
                          </div>
                        ) : (
                          // Sent: Single checkmark
                          <Check className="h-3 w-3 text-blue-200/60" />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-neutral-700" style={{ paddingBottom: '64px' }}>
        <div className="flex items-end space-x-2">
          <button
            className="p-2 text-neutral-400 hover:text-white transition-colors"
            aria-label="Attach media"
            title="Attach media (coming soon)"
          >
            <Paperclip className="h-5 w-5" />
          </button>
          <textarea
            ref={inputRef}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Type a message..."
            rows={1}
            className="flex-1 px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            style={{ minHeight: '40px', maxHeight: '120px' }}
          />
          <button
            onClick={handleSend}
            disabled={!newMessage.trim() || sending}
            className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Send"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

