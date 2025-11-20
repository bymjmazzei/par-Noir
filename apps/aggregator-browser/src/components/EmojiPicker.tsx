/**
 * Emoji Picker Component
 * Reusable emoji picker with toggle button and emoji railway
 */

import React, { useState, useRef, useEffect } from 'react';
import { Smile, Type } from 'lucide-react';

const MOST_USED_EMOJIS = [
  '😀', '😂', '❤️', '😍', '🤔', '😮', '😢', '🔥', '👏', '💯',
  '👍', '👎', '🎉', '🙌', '😊', '😎', '🤗', '😴', '🤯', '🥳'
];

interface EmojiPickerProps {
  onEmojiSelect: (emoji: string) => void;
  textValue: string;
  containerRef?: React.RefObject<HTMLDivElement>;
}

export function EmojiPicker({ onEmojiSelect, textValue, containerRef }: EmojiPickerProps) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(event.target as Node) &&
        containerRef?.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setShowEmojiPicker(false);
      }
    };

    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showEmojiPicker, containerRef]);

  return (
    <>
      {/* Toggle Button - Inside text box at right end */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setShowEmojiPicker(!showEmojiPicker);
        }}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-text-secondary hover:text-white transition-colors flex items-center justify-center z-10 pointer-events-auto"
        title={showEmojiPicker ? 'Switch to text' : 'Switch to emoji'}
      >
        {showEmojiPicker ? (
          <Type className="h-5 w-5" />
        ) : (
          <Smile className="h-5 w-5" />
        )}
      </button>

      {/* Emoji Picker Menu - Shows inside text box with text above */}
      {showEmojiPicker && (
        <div
          ref={pickerRef}
          className="absolute bottom-full right-0 mb-2 bg-neutral-800 border border-neutral-700 rounded-lg shadow-lg z-50 pointer-events-auto"
          style={{ minWidth: '280px', maxWidth: '320px' }}
        >
          {/* Show written text above emoji picker */}
          {textValue && (
            <div className="px-3 py-2 border-b border-neutral-700">
              <p className="text-white text-sm break-words">{textValue}</p>
            </div>
          )}
          
          {/* Emoji Railway */}
          <div className="p-3">
            <div className="text-xs text-text-secondary mb-2">Most Used</div>
            <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              {MOST_USED_EMOJIS.map((emoji, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onEmojiSelect(emoji);
                  }}
                  className="text-2xl hover:scale-110 transition-transform p-1 flex-shrink-0"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

