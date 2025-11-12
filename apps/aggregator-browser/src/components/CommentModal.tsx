/**
 * Comment Modal Component
 * Shows comments and allows adding new ones
 */

import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Heart, User } from 'lucide-react';
import { IndexedFile } from '../types/aggregator';
import { useUserState } from '../contexts/UserStateContext';
import { useEngagement } from '../hooks/useEngagement';
import { PNConnect } from './PNConnect';

interface CommentModalProps {
  file: IndexedFile;
  onClose: () => void;
}

export function CommentModal({ file, onClose }: CommentModalProps) {
  const { userState } = useUserState();
  const { addComment, getComments } = useEngagement();
  const [newComment, setNewComment] = useState('');
  const [comments, setComments] = useState(getComments(file.metadata.fileId));
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setComments(getComments(file.metadata.fileId));
  }, [file.metadata.fileId, getComments]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !userState.isUnlocked) return;

    const authorId = userState.pnIdentifier || 'anonymous';
    const authorName = userState.pnIdentifier?.substring(0, 8) || 'Anonymous';
    
    addComment(file.metadata.fileId, newComment.trim(), authorId, authorName);
    setNewComment('');
    setComments(getComments(file.metadata.fileId));
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900 rounded-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-700">
          <h2 className="text-xl font-bold text-white">Comments</h2>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Comments List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {comments.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-text-secondary">No comments yet. Be the first to comment!</p>
            </div>
          ) : (
            comments.map((comment) => (
              <div key={comment.id} className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                  <User className="h-4 w-4 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="text-white font-medium text-sm">{comment.authorName}</span>
                    <span className="text-text-secondary text-xs">
                      {new Date(comment.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-white text-sm">{comment.content}</p>
                  {comment.likes !== undefined && comment.likes > 0 && (
                    <div className="flex items-center space-x-1 mt-2">
                      <Heart className="h-3 w-3 text-red-400" />
                      <span className="text-text-secondary text-xs">{comment.likes}</span>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Comment Input */}
        <div className="p-6 border-t border-neutral-700">
          {!userState.isUnlocked ? (
            <div className="text-center py-4">
              <p className="text-text-secondary text-sm mb-4">Connect your pN to comment</p>
              <PNConnect compact />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex items-end space-x-3">
              <div className="flex-1">
                <textarea
                  ref={inputRef}
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add a comment..."
                  className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  rows={2}
                  maxLength={500}
                />
                <p className="text-text-secondary text-xs mt-1">
                  {newComment.length}/500
                </p>
              </div>
              <button
                type="submit"
                disabled={!newComment.trim()}
                className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                <Send className="h-4 w-4" />
                <span>Post</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

