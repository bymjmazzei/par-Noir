/**
 * Text Post Editor Component
 * Full-featured editor for creating "Thoughts" (text-based posts)
 */

import React, { useState, useRef, useEffect } from 'react';
import { X, Check, Palette, Type, Image as ImageIcon, Upload } from 'lucide-react';
import { TextPostData, TextPostStyle } from '../types/aggregator';

interface TextPostEditorProps {
  onSave: (textPost: TextPostData) => void;
  onCancel: () => void;
}

const FONT_OPTIONS = [
  { value: 'Arial', label: 'Arial' },
  { value: 'Helvetica', label: 'Helvetica' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Times New Roman', label: 'Times New Roman' },
  { value: 'Courier New', label: 'Courier New' },
  { value: 'Verdana', label: 'Verdana' },
  { value: 'Impact', label: 'Impact' },
  { value: 'Comic Sans MS', label: 'Comic Sans MS' },
  { value: 'Trebuchet MS', label: 'Trebuchet MS' },
  { value: 'Roboto', label: 'Roboto' },
  { value: 'Open Sans', label: 'Open Sans' },
  { value: 'Lato', label: 'Lato' },
  { value: 'Montserrat', label: 'Montserrat' },
  { value: 'Poppins', label: 'Poppins' },
  { value: 'Playfair Display', label: 'Playfair Display' },
];

export function TextPostEditor({ onSave, onCancel }: TextPostEditorProps) {
  const [content, setContent] = useState('');
  const [fontFamily, setFontFamily] = useState('Arial');
  const [fontSize, setFontSize] = useState(48);
  const [textColor, setTextColor] = useState('#FFFFFF');
  const [dropShadowColor, setDropShadowColor] = useState('#000000');
  const [dropShadowBlur, setDropShadowBlur] = useState(10);
  const [dropShadowOffsetX, setDropShadowOffsetX] = useState(2);
  const [dropShadowOffsetY, setDropShadowOffsetY] = useState(2);
  const [backgroundColor, setBackgroundColor] = useState('#000000');
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right' | 'justify'>('center');
  const [padding, setPadding] = useState(40);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preview rendering
  useEffect(() => {
    if (canvasRef.current && content.trim()) {
      renderPreview();
    }
  }, [content, fontFamily, fontSize, textColor, dropShadowColor, dropShadowBlur, 
      dropShadowOffsetX, dropShadowOffsetY, backgroundColor, backgroundImage, textAlign, padding]);

  const renderPreview = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size (standard post aspect ratio, e.g., 9:16 for vertical feed)
    const width = 1080;
    const height = 1920;
    canvas.width = width;
    canvas.height = height;

    // Fill background
    if (backgroundImage) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        ctx.drawImage(img, 0, 0, width, height);
        drawText(ctx, width, height);
      };
      img.onerror = () => {
        // Fallback to solid color if image fails to load
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, width, height);
        drawText(ctx, width, height);
      };
      img.src = backgroundImage;
    } else {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, width, height);
      drawText(ctx, width, height);
    }
  };

  const drawText = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.save();
    
    // Set font
    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.fillStyle = textColor;
    
    // Set text alignment
    if (textAlign === 'center') {
      ctx.textAlign = 'center';
    } else if (textAlign === 'right') {
      ctx.textAlign = 'right';
    } else if (textAlign === 'left') {
      ctx.textAlign = 'left';
    } else {
      ctx.textAlign = 'left'; // justify handled separately
    }
    
    ctx.textBaseline = 'middle';

    // Apply drop shadow
    ctx.shadowColor = dropShadowColor;
    ctx.shadowBlur = dropShadowBlur;
    ctx.shadowOffsetX = dropShadowOffsetX;
    ctx.shadowOffsetY = dropShadowOffsetY;

    // Word wrap text
    const maxWidth = width - (padding * 2);
    const lines = wrapText(ctx, content, maxWidth, textAlign === 'justify');
    const lineHeight = fontSize * 1.2;
    const totalHeight = lines.length * lineHeight;
    const startY = (height - totalHeight) / 2;

    lines.forEach((line, index) => {
      const y = startY + (index * lineHeight);
      let x = width / 2; // Default center
      
      if (textAlign === 'left') {
        x = padding;
      } else if (textAlign === 'right') {
        x = width - padding;
      } else if (textAlign === 'justify') {
        x = padding;
        // For justify, we'd need to calculate spacing, but for simplicity, use left
      }
      
      ctx.fillText(line, x, y);
    });
    
    ctx.restore();
  };

  const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number, justify: boolean = false): string[] => {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = words[0] || '';

    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      const testLine = currentLine + ' ' + word;
      const metrics = ctx.measureText(testLine);
      
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    return lines.length > 0 ? lines : [''];
  };

  const handleBackgroundImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        setBackgroundImage(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = () => {
    if (!content.trim()) {
      alert('Please enter some text');
      return;
    }

    const textPost: TextPostData = {
      content: content.trim(),
      style: {
        fontFamily,
        fontSize,
        textColor,
        dropShadowColor,
        dropShadowBlur,
        dropShadowOffsetX,
        dropShadowOffsetY,
        backgroundColor,
        backgroundImage: backgroundImage || undefined,
        textAlign,
        padding,
      }
    };

    onSave(textPost);
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Editor Controls */}
        <div className="w-80 bg-neutral-900 border-r border-neutral-800 overflow-y-auto p-4" style={{ paddingBottom: '80px' }}>
          <div className="mb-6">
            <h2 className="text-white text-lg font-semibold mb-4">Create Thought</h2>
            
            {/* Text Input */}
            <div className="mb-4">
              <label className="block text-white text-sm font-medium mb-2">Text Content</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Type your thought here..."
                className="w-full h-32 bg-neutral-800 text-white rounded-lg p-3 border border-neutral-700 focus:border-blue-500 focus:outline-none resize-none"
              />
            </div>

            {/* Font Selection */}
            <div className="mb-4">
              <label className="block text-white text-sm font-medium mb-2 flex items-center gap-2">
                <Type className="h-4 w-4" />
                Font
              </label>
              <select
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value)}
                className="w-full bg-neutral-800 text-white rounded-lg p-2 border border-neutral-700 focus:border-blue-500 focus:outline-none"
              >
                {FONT_OPTIONS.map(font => (
                  <option key={font.value} value={font.value}>{font.label}</option>
                ))}
              </select>
            </div>

            {/* Font Size */}
            <div className="mb-4">
              <label className="block text-white text-sm font-medium mb-2">Font Size: {fontSize}px</label>
              <input
                type="range"
                min="24"
                max="120"
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="w-full"
              />
            </div>

            {/* Text Color */}
            <div className="mb-4">
              <label className="block text-white text-sm font-medium mb-2 flex items-center gap-2">
                <Palette className="h-4 w-4" />
                Text Color
              </label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={textColor}
                  onChange={(e) => setTextColor(e.target.value)}
                  className="w-16 h-10 rounded border border-neutral-700 cursor-pointer"
                />
                <input
                  type="text"
                  value={textColor}
                  onChange={(e) => setTextColor(e.target.value)}
                  className="flex-1 bg-neutral-800 text-white rounded-lg p-2 border border-neutral-700 focus:border-blue-500 focus:outline-none"
                  placeholder="#FFFFFF"
                />
              </div>
            </div>

            {/* Drop Shadow */}
            <div className="mb-4">
              <label className="block text-white text-sm font-medium mb-2">Drop Shadow</label>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={dropShadowColor}
                    onChange={(e) => setDropShadowColor(e.target.value)}
                    className="w-16 h-10 rounded border border-neutral-700 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={dropShadowColor}
                    onChange={(e) => setDropShadowColor(e.target.value)}
                    className="flex-1 bg-neutral-800 text-white rounded-lg p-2 border border-neutral-700 focus:border-blue-500 focus:outline-none"
                    placeholder="#000000"
                  />
                </div>
                <div>
                  <label className="text-white text-xs mb-1 block">Blur: {dropShadowBlur}px</label>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    value={dropShadowBlur}
                    onChange={(e) => setDropShadowBlur(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-white text-xs mb-1 block">Offset X: {dropShadowOffsetX}px</label>
                    <input
                      type="range"
                      min="-20"
                      max="20"
                      value={dropShadowOffsetX}
                      onChange={(e) => setDropShadowOffsetX(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="text-white text-xs mb-1 block">Offset Y: {dropShadowOffsetY}px</label>
                    <input
                      type="range"
                      min="-20"
                      max="20"
                      value={dropShadowOffsetY}
                      onChange={(e) => setDropShadowOffsetY(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Background */}
            <div className="mb-4">
              <label className="block text-white text-sm font-medium mb-2 flex items-center gap-2">
                <ImageIcon className="h-4 w-4" />
                Background
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="color"
                  value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  className="w-16 h-10 rounded border border-neutral-700 cursor-pointer"
                />
                <input
                  type="text"
                  value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  className="flex-1 bg-neutral-800 text-white rounded-lg p-2 border border-neutral-700 focus:border-blue-500 focus:outline-none"
                  placeholder="#000000"
                />
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full bg-neutral-800 text-white rounded-lg p-2 border border-neutral-700 hover:bg-neutral-700 transition-colors text-sm flex items-center justify-center gap-2"
              >
                <Upload className="h-4 w-4" />
                Upload Background Image
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleBackgroundImageUpload}
                className="hidden"
              />
              {backgroundImage && (
                <button
                  onClick={() => setBackgroundImage(null)}
                  className="mt-2 w-full bg-red-600 text-white rounded-lg p-2 text-sm hover:bg-red-700 transition-colors"
                >
                  Remove Background Image
                </button>
              )}
            </div>

            {/* Text Align */}
            <div className="mb-4">
              <label className="block text-white text-sm font-medium mb-2">Text Alignment</label>
              <div className="grid grid-cols-4 gap-2">
                {(['left', 'center', 'right', 'justify'] as const).map(align => (
                  <button
                    key={align}
                    onClick={() => setTextAlign(align)}
                    className={`p-2 rounded border text-xs ${
                      textAlign === align
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-neutral-800 border-neutral-700 text-white hover:bg-neutral-700'
                    }`}
                  >
                    {align.charAt(0).toUpperCase() + align.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Padding */}
            <div className="mb-6">
              <label className="block text-white text-sm font-medium mb-2">Padding: {padding}px</label>
              <input
                type="range"
                min="0"
                max="100"
                value={padding}
                onChange={(e) => setPadding(Number(e.target.value))}
                className="w-full"
              />
            </div>
          </div>
        </div>

        {/* Right Panel - Preview */}
        <div className="flex-1 flex items-center justify-center bg-neutral-950 p-8" style={{ paddingBottom: '80px' }}>
          <div className="w-full max-w-md aspect-[9/16] bg-neutral-900 rounded-lg overflow-hidden shadow-2xl">
            <canvas
              ref={canvasRef}
              className="w-full h-full"
              style={{ display: content.trim() ? 'block' : 'none' }}
            />
            {!content.trim() && (
              <div className="w-full h-full flex items-center justify-center text-neutral-500">
                <p>Preview will appear here</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer Actions - Sticky */}
      <div className="fixed bottom-0 left-0 right-0 h-16 bg-neutral-900 border-t border-neutral-800 flex items-center justify-end gap-4 px-6 z-50">
        <button
          onClick={onCancel}
          className="px-6 py-2 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <Check className="h-4 w-4" />
          Create Thought
        </button>
      </div>
    </div>
  );
}

