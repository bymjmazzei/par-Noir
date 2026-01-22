/**
 * Message Thread Component
 * Conversation view for messaging
 */

import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Send, Image as ImageIcon, Paperclip } from 'lucide-react';
import { Message } from '../services/messageService';
import { useUserState } from '../contexts/UserStateContext';
import { getThreadMessages, sendMessage, markAsRead } from '../services/messageService';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from './Toast';

interface MessageThreadProps {
  participantDid: string;
  participantName?: string;
  onBack: () => void;
}

export function MessageThread({ participantDid, participantName, onBack }: MessageThreadProps) {
  const { userState } = useUserState();
  const { error: showError, toasts, removeToast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isPollingRef = useRef(false);
  const errorCountRef = useRef(0);

  // Load messages
  useEffect(() => {
    if (!userState.isUnlocked || !userState.pnIdentifier) return;

    const loadMessages = async (isInitial = false) => {
      // Prevent duplicate requests
      if (isPollingRef.current && !isInitial) {
        return; // Already polling, skip this request
      }

      // Only show loading spinner on initial load
      if (isInitial) {
        setLoading(true);
      } else {
        isPollingRef.current = true;
      }
      
      try {
        const threadMessages = await getThreadMessages(userState.pnIdentifier!, participantDid);
        // Reset error count on success
        errorCountRef.current = 0;
        
        // Reverse messages to show oldest first (chat order) - API returns newest first
        const reversedMessages = [...threadMessages].reverse();
        
        // Preserve optimistic (temporary) messages - merge with fetched messages
        const tempMessages = messages.filter(msg => msg.messageId.startsWith('temp-'));
        const existingMessageIds = new Set(reversedMessages.map(m => m.messageId));
        const preservedTempMessages = tempMessages.filter(msg => !existingMessageIds.has(msg.messageId));
        
        // Combine fetched messages with preserved temporary messages
        const allMessages = [...reversedMessages, ...preservedTempMessages];
        // Sort by timestamp to maintain order
        allMessages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        
        // Only update messages if fetch was successful
        setMessages(allMessages);

        // Mark unread messages as read
        const unreadMessages = threadMessages.filter(m => !m.read && m.toDid === userState.pnIdentifier);
        for (const message of unreadMessages) {
          try {
            await markAsRead(message.messageId, userState.pnIdentifier!, participantDid);
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
        if (isInitial) {
          setLoading(false);
        } else {
          isPollingRef.current = false;
        }
      }
    };

    // Initial load
    loadMessages(true);

    // Poll for new messages - only when tab is visible, with exponential backoff on errors
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && !isPollingRef.current) {
        // Stop polling if too many consecutive errors
        if (errorCountRef.current >= 3) {
          console.warn('Too many polling errors, stopping automatic refresh');
          return;
        }
        loadMessages(false);
      }
    }, 15000); // 15 seconds instead of 5
    
    return () => clearInterval(interval);
  }, [userState.isUnlocked, userState.pnIdentifier, participantDid]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
      fromDid: userState.pnIdentifier!,
      toDid: participantDid,
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
        participantDid,
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

  const displayName = participantName || participantDid.substring(0, 16) + '...';

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
          <div>
            <h2 className="text-white font-semibold">{displayName}</h2>
            <p className="text-neutral-400 text-xs">{participantDid}</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
          messages.map((message) => {
            const isOwn = message.fromDid === userState.pnIdentifier;
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
                  <p className={`text-xs mt-1 ${
                    isOwn ? 'text-blue-100' : 'text-neutral-400'
                  }`}>
                    {isTemporary && '⏳ '}
                    {new Date(message.timestamp).toLocaleTimeString()}
                    {message.read && isOwn && !isTemporary && ' ✓'}
                  </p>
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

