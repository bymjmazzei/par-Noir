/**
 * Text Post Editor Component
 * Full-featured editor for creating "Thoughts" (text-based posts)
 */

import React, { useState, useRef, useEffect } from 'react';
import { X, Check, Palette, Type, Image as ImageIcon, Upload, AlignLeft, AlignCenter, AlignRight, AlignJustify, Layers, Minus, Plus as PlusIcon, Send, Bold } from 'lucide-react';
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [textareaHeight, setTextareaHeight] = useState(60); // Starting height
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
  const [textStyle, setTextStyle] = useState<'plain' | 'bold' | 'italic' | 'strikethrough'>('plain');
  const [padding, setPadding] = useState(40);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fontSelectorRef = useRef<HTMLDivElement>(null);
  const activeFontButtonRef = useRef<HTMLButtonElement | null>(null);
  
  // Popup menu states
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const menuButtonRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());

  // Initialize textarea height on mount
  useEffect(() => {
    if (textareaRef.current) {
      const initialHeight = 44; // Single row height
      textareaRef.current.style.height = `${initialHeight}px`;
      setTextareaHeight(initialHeight + 32); // Add padding (16px top + 16px bottom)
    }
  }, []);

  // Center active font in font selector
  useEffect(() => {
    if (activeFontButtonRef.current && fontSelectorRef.current) {
      const button = activeFontButtonRef.current;
      const container = fontSelectorRef.current;
      
      // Get container and button positions
      const containerRect = container.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      
      // Calculate center positions
      const containerCenter = containerRect.left + containerRect.width / 2;
      const buttonCenter = buttonRect.left + buttonRect.width / 2;
      
      // Calculate scroll offset needed to center the button
      const scrollOffset = buttonCenter - containerCenter;
      
      // Get current scroll position
      const currentScroll = container.scrollLeft;
      
      // Calculate new scroll position
      const newScroll = currentScroll + scrollOffset;
      
      // Scroll to center the button
      container.scrollTo({
        left: newScroll,
        behavior: 'smooth'
      });
    }
  }, [fontFamily]);

  // Preview rendering
  useEffect(() => {
    if (canvasRef.current && content.trim()) {
      renderPreview();
    }
  }, [content, fontFamily, fontSize, textColor, textStyle, dropShadowColor, dropShadowBlur, 
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
    
    // Set font with text style
    let fontStyle = '';
    if (textStyle === 'bold') {
      fontStyle = 'bold ';
    } else if (textStyle === 'italic') {
      fontStyle = 'italic ';
    } else if (textStyle === 'strikethrough') {
      // Strikethrough is handled separately with a line
      fontStyle = '';
    }
    ctx.font = `${fontStyle}${fontSize}px ${fontFamily}`;
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
      
      // Draw strikethrough line if needed
      if (textStyle === 'strikethrough') {
        const metrics = ctx.measureText(line);
        let lineX = x;
        let lineWidth = metrics.width;
        
        if (textAlign === 'center') {
          lineX = x - metrics.width / 2;
        } else if (textAlign === 'right') {
          lineX = x - metrics.width;
        }
        
        ctx.strokeStyle = textColor;
        ctx.lineWidth = Math.max(1, fontSize / 20);
        ctx.beginPath();
        ctx.moveTo(lineX, y);
        ctx.lineTo(lineX + lineWidth, y);
        ctx.stroke();
      }
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
        textStyle,
        padding,
      }
    };

    onSave(textPost);
  };

  const openPopupMenu = (menuId: string, button: HTMLButtonElement) => {
    const rect = button.getBoundingClientRect();
    setOpenMenu(menuId);
    // Open menu above the button - we'll use transform to position it above
    setMenuPosition({
      top: rect.top,
      left: rect.left
    });
  };

  const closeMenu = () => {
    setOpenMenu(null);
    setMenuPosition(null);
  };

  // Close menu when clicking outside
  useEffect(() => {
    if (!openMenu) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const button = menuButtonRefs.current.get(openMenu);
      if (button && (button.contains(target) || button === target)) {
        return;
      }
      const menuElement = document.querySelector(`[data-menu="${openMenu}"]`);
      if (menuElement && menuElement.contains(target)) {
        return;
      }
      closeMenu();
    };

    const timeout = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside, true);
    }, 200);

    return () => {
      clearTimeout(timeout);
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [openMenu]);

  const renderPopupMenu = () => {
    if (!openMenu || !menuPosition) return null;

    const menuContent = () => {
      switch (openMenu) {
        case 'font':
          return (
            <div className="max-h-64 overflow-y-auto">
              {FONT_OPTIONS.map(font => (
                <button
                  key={font.value}
                  onClick={() => {
                    setFontFamily(font.value);
                    closeMenu();
                  }}
                  className="w-full px-4 py-2 text-left text-white hover:bg-neutral-700 flex items-center justify-between"
                  style={{ fontFamily: font.value }}
                >
                  <span>{font.label}</span>
                  {fontFamily === font.value && (
                    <Check className="h-4 w-4 text-blue-500" />
                  )}
                </button>
              ))}
            </div>
          );
        case 'fontSize':
          return (
            <div className="p-4 min-w-[200px]">
              <div className="flex items-center gap-3 mb-2">
                <button
                  onClick={() => setFontSize(Math.max(24, fontSize - 4))}
                  className="p-1 rounded hover:bg-neutral-700"
                >
                  <Minus className="h-4 w-4 text-white" />
                </button>
                <span className="text-white text-sm font-medium flex-1 text-center">{fontSize}px</span>
                <button
                  onClick={() => setFontSize(Math.min(120, fontSize + 4))}
                  className="p-1 rounded hover:bg-neutral-700"
                >
                  <PlusIcon className="h-4 w-4 text-white" />
                </button>
              </div>
              <input
                type="range"
                min="24"
                max="120"
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="w-full"
              />
            </div>
          );
        case 'textColor':
          return (
            <div className="p-4 min-w-[200px]">
              <div className="flex gap-2 mb-2">
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
                  className="flex-1 bg-neutral-800 text-white rounded-lg p-2 border border-neutral-700 focus:border-blue-500 focus:outline-none text-sm"
                  placeholder="#FFFFFF"
                />
              </div>
            </div>
          );
        case 'shadow':
          return (
            <div className="p-4 min-w-[240px]">
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={dropShadowColor}
                    onChange={(e) => setDropShadowColor(e.target.value)}
                    className="w-12 h-10 rounded border border-neutral-700 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={dropShadowColor}
                    onChange={(e) => setDropShadowColor(e.target.value)}
                    className="flex-1 bg-neutral-800 text-white rounded-lg p-2 border border-neutral-700 focus:border-blue-500 focus:outline-none text-sm"
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
                    <label className="text-white text-xs mb-1 block">X: {dropShadowOffsetX}px</label>
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
                    <label className="text-white text-xs mb-1 block">Y: {dropShadowOffsetY}px</label>
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
          );
        case 'background':
          return (
            <div className="p-4 min-w-[200px]">
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={backgroundColor}
                    onChange={(e) => setBackgroundColor(e.target.value)}
                    className="w-12 h-10 rounded border border-neutral-700 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={backgroundColor}
                    onChange={(e) => setBackgroundColor(e.target.value)}
                    className="flex-1 bg-neutral-800 text-white rounded-lg p-2 border border-neutral-700 focus:border-blue-500 focus:outline-none text-sm"
                    placeholder="#000000"
                  />
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full bg-neutral-800 text-white rounded-lg p-2 border border-neutral-700 hover:bg-neutral-700 transition-colors text-sm flex items-center justify-center gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Upload Image
                </button>
                {backgroundImage && (
                  <button
                    onClick={() => setBackgroundImage(null)}
                    className="w-full bg-red-600 text-white rounded-lg p-2 text-sm hover:bg-red-700 transition-colors"
                  >
                    Remove Image
                  </button>
                )}
              </div>
            </div>
          );
        case 'textStyle':
          return (
            <div className="p-2 min-w-[180px]">
              {([
                { value: 'plain' as const, label: 'A', style: {} },
                { value: 'bold' as const, label: 'A', style: { fontWeight: 'bold' } },
                { value: 'italic' as const, label: 'A', style: { fontStyle: 'italic' } },
                { value: 'strikethrough' as const, label: 'A', style: { textDecoration: 'line-through' } },
              ]).map(({ value, label, style }) => (
                <button
                  key={value}
                  onClick={() => {
                    setTextStyle(value);
                    closeMenu();
                  }}
                  className={`w-full px-4 py-2 text-left text-white hover:bg-neutral-700 flex items-center justify-between ${
                    textStyle === value ? 'bg-neutral-700' : ''
                  }`}
                  style={style}
                >
                  <span className="text-lg">{label}</span>
                  {textStyle === value && (
                    <Check className="h-4 w-4 text-blue-500" />
                  )}
                </button>
              ))}
            </div>
          );
        case 'align':
          return (
            <div className="p-2">
              <div className="grid grid-cols-2 gap-2">
                {([
                  { value: 'left' as const, icon: AlignLeft },
                  { value: 'center' as const, icon: AlignCenter },
                  { value: 'right' as const, icon: AlignRight },
                  { value: 'justify' as const, icon: AlignJustify },
                ]).map(({ value, icon: Icon }) => (
                  <button
                    key={value}
                    onClick={() => {
                      setTextAlign(value);
                      closeMenu();
                    }}
                    className={`p-3 rounded border flex items-center justify-center ${
                      textAlign === value
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-neutral-800 border-neutral-700 text-white hover:bg-neutral-700'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </button>
                ))}
              </div>
            </div>
          );
        case 'padding':
          return (
            <div className="p-4 min-w-[200px]">
              <div className="flex items-center gap-3 mb-2">
                <button
                  onClick={() => setPadding(Math.max(0, padding - 10))}
                  className="p-1 rounded hover:bg-neutral-700"
                >
                  <Minus className="h-4 w-4 text-white" />
                </button>
                <span className="text-white text-sm font-medium flex-1 text-center">{padding}px</span>
                <button
                  onClick={() => setPadding(Math.min(100, padding + 10))}
                  className="p-1 rounded hover:bg-neutral-700"
                >
                  <PlusIcon className="h-4 w-4 text-white" />
                </button>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={padding}
                onChange={(e) => setPadding(Number(e.target.value))}
                className="w-full"
              />
            </div>
          );
        default:
          return null;
      }
    };

    return (
      <div
        data-menu={openMenu}
        className="fixed z-50 bg-neutral-800 border border-neutral-700 rounded-lg shadow-lg"
        style={{
          top: `${menuPosition.top}px`,
          left: `${menuPosition.left}px`,
          transform: 'translateY(-100%)', // Position above the button
          marginTop: '-8px' // 8px gap above button
        }}
      >
        {menuContent()}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Preview - Above text input, scales with screen */}
      <div 
        className="fixed left-0 right-0 flex items-center justify-center z-30"
        style={{ 
          bottom: `calc(64px + ${textareaHeight}px + 48px + 56px)`,
          top: '0',
        }}
      >
        <div 
          className="w-full h-full flex items-center justify-center relative"
          style={{
            backgroundImage: backgroundImage ? `url(${backgroundImage})` : 'none',
            backgroundColor: backgroundImage ? 'transparent' : backgroundColor,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        >
          {content.trim() ? (
            <div
              className="w-full px-8 text-center"
              style={{
                fontFamily: fontFamily,
                fontSize: `clamp(24px, 5vw, ${fontSize}px)`,
                color: textColor,
                fontWeight: textStyle === 'bold' ? 'bold' : 'normal',
                fontStyle: textStyle === 'italic' ? 'italic' : 'normal',
                textDecoration: textStyle === 'strikethrough' ? 'line-through' : 'none',
                textAlign: textAlign as 'left' | 'center' | 'right' | 'justify',
                textShadow: `
                  ${dropShadowOffsetX}px 
                  ${dropShadowOffsetY}px 
                  ${dropShadowBlur}px 
                  ${dropShadowColor}
                `,
                padding: `${padding}px`,
                lineHeight: 1.2,
              }}
            >
              {content}
            </div>
          ) : (
            <div className="text-neutral-500">
              <p>Preview will appear here</p>
            </div>
          )}
        </div>
      </div>

      {/* Main Railway with Icon Buttons - Sticky (above font selector, overlays media) */}
      <div className="fixed left-0 right-0 h-14 flex items-center justify-center gap-4 px-4 z-40" style={{ bottom: `calc(64px + ${textareaHeight}px + 48px)` }}>
        <div className="flex items-center gap-4 overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>

          {/* Font Size - Small A next to large A */}
          <button
            ref={(el) => menuButtonRefs.current.set('fontSize', el)}
            onClick={(e) => {
              const button = e.currentTarget;
              if (openMenu === 'fontSize') {
                closeMenu();
              } else {
                openPopupMenu('fontSize', button);
              }
            }}
            className="px-2 py-1 transition-opacity hover:opacity-80 flex items-baseline gap-1"
            style={{ color: 'white' }}
          >
            <span className="text-xs">A</span>
            <span className="text-lg font-bold">A</span>
          </button>

          {/* Text Color - A with colored line under */}
          <button
            ref={(el) => menuButtonRefs.current.set('textColor', el)}
            onClick={(e) => {
              const button = e.currentTarget;
              if (openMenu === 'textColor') {
                closeMenu();
              } else {
                openPopupMenu('textColor', button);
              }
            }}
            className="px-2 py-1 transition-opacity hover:opacity-80 flex flex-col items-center gap-0.5"
            style={{ color: 'white' }}
          >
            <span className="text-sm">A</span>
            <div 
              className="w-6 h-0.5"
              style={{ backgroundColor: textColor }}
            />
          </button>

          {/* Drop Shadow - A with shadow, colored line under */}
          <button
            ref={(el) => menuButtonRefs.current.set('shadow', el)}
            onClick={(e) => {
              const button = e.currentTarget;
              if (openMenu === 'shadow') {
                closeMenu();
              } else {
                openPopupMenu('shadow', button);
              }
            }}
            className="px-2 py-1 transition-opacity hover:opacity-80 flex flex-col items-center gap-0.5 relative"
            style={{ color: 'white' }}
          >
            <span 
              className="text-sm relative"
              style={{
                textShadow: `${dropShadowOffsetX}px ${dropShadowOffsetY}px ${dropShadowBlur}px ${dropShadowColor}`
              }}
            >
              A
            </span>
            <div 
              className="w-6 h-0.5"
              style={{ backgroundColor: dropShadowColor }}
            />
          </button>

          {/* Background */}
          <button
            ref={(el) => menuButtonRefs.current.set('background', el)}
            onClick={(e) => {
              const button = e.currentTarget;
              if (openMenu === 'background') {
                closeMenu();
              } else {
                openPopupMenu('background', button);
              }
            }}
            className="px-2 py-1 transition-opacity hover:opacity-80"
            style={{ color: 'white' }}
          >
            <ImageIcon className="h-4 w-4" />
          </button>

          {/* Alignment */}
          <button
            ref={(el) => menuButtonRefs.current.set('align', el)}
            onClick={(e) => {
              const button = e.currentTarget;
              if (openMenu === 'align') {
                closeMenu();
              } else {
                openPopupMenu('align', button);
              }
            }}
            className="px-2 py-1 transition-opacity hover:opacity-80"
            style={{ color: 'white' }}
          >
            {textAlign === 'left' && <AlignLeft className="h-4 w-4" />}
            {textAlign === 'center' && <AlignCenter className="h-4 w-4" />}
            {textAlign === 'right' && <AlignRight className="h-4 w-4" />}
            {textAlign === 'justify' && <AlignJustify className="h-4 w-4" />}
          </button>

        </div>
      </div>

      {/* Font Selector Railway - Sticky (above text input, overlays media) */}
      <div className="fixed left-0 right-0 h-12 flex items-center justify-center z-40" style={{ bottom: `calc(64px + ${textareaHeight}px)` }}>
        <div 
          ref={fontSelectorRef}
          className="flex items-center gap-6 overflow-x-auto w-full"
          style={{ 
            scrollbarWidth: 'none', 
            msOverflowStyle: 'none',
            paddingLeft: '50%',
            paddingRight: '50%'
          }}
        >
          {FONT_OPTIONS.map((font) => (
            <button
              key={font.value}
              ref={fontFamily === font.value ? activeFontButtonRef : null}
              onClick={() => setFontFamily(font.value)}
              className="px-2 py-1 transition-opacity hover:opacity-80 relative"
              style={{ 
                fontFamily: font.value, 
                color: 'white',
                textDecoration: fontFamily === font.value ? 'underline' : 'none',
                textUnderlineOffset: '4px'
              }}
            >
              <span className="text-sm whitespace-nowrap">{font.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Text Input - Sticky above bottom nav, auto-expanding */}
      <div 
        className="fixed left-0 right-0 bg-neutral-900 border-t border-neutral-800 z-50" 
        style={{ bottom: '64px' }}
      >
        <div className="flex items-end gap-2 p-4">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              // Auto-resize textarea
              if (textareaRef.current) {
                textareaRef.current.style.height = 'auto';
                const newHeight = Math.min(textareaRef.current.scrollHeight, 200);
                textareaRef.current.style.height = `${newHeight}px`;
                setTextareaHeight(newHeight + 32); // Add padding (16px top + 16px bottom)
              }
            }}
            placeholder="Type your thought here..."
            className="flex-1 bg-neutral-800 text-white rounded-lg p-3 border border-neutral-700 focus:border-blue-500 focus:outline-none resize-none overflow-y-auto"
            style={{ 
              minHeight: '44px',
              maxHeight: '200px',
              lineHeight: '1.5'
            }}
            rows={1}
          />
          <button
            onClick={handleSave}
            className="p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center mb-0.5"
            disabled={!content.trim()}
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Popup Menus */}
      {renderPopupMenu()}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleBackgroundImageUpload}
        className="hidden"
      />
    </div>
  );
}
