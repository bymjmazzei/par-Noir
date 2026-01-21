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

  // Load messages
  useEffect(() => {
    if (!userState.isUnlocked || !userState.pnIdentifier) return;

    const loadMessages = async (isInitial = false) => {
      // Only show loading spinner on initial load
      if (isInitial) {
        setLoading(true);
      }
      
      try {
        const threadMessages = await getThreadMessages(userState.pnIdentifier!, participantDid);
        // Only update messages if fetch was successful
        setMessages(threadMessages);

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
        }
      }
    };

    // Initial load
    loadMessages(true);

    // Poll for new messages - only when tab is visible
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadMessages(false);
      }
    }, 5000);
    
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

    try {
      const sentMessage = await sendMessage(
        userState.pnIdentifier!,
        participantDid,
        content
      );
      setMessages(prev => [...prev, sentMessage]);
    } catch (error: any) {
      console.error('Failed to send message:', error);
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
                  }`}
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
                    {new Date(message.timestamp).toLocaleTimeString()}
                    {message.read && isOwn && ' ✓'}
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

