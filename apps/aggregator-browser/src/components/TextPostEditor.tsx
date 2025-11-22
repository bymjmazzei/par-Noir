/**
 * Text Post Editor Component
 * Full-featured editor for creating "Thoughts" (text-based posts)
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Palette, Type, Image as ImageIcon, Upload, AlignLeft, AlignCenter, AlignRight, AlignJustify, Layers, Minus, Plus as PlusIcon, Send, Bold } from 'lucide-react';
import { TextPostData, TextPostStyle, ContentRating, FeedCategory } from '../types/aggregator';
import { useUserState } from '../contexts/UserStateContext';
import { CONTENT_RATINGS, RATING_ORDER, getDefaultContentRating } from '../constants/contentRatings';
import { FEED_CATEGORY_LIST } from '../constants/feedCategories';

// Helper function to convert hex to RGB
const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 0, g: 0, b: 0 };
};

// Helper function to convert RGB to hex
const rgbToHex = (r: number, g: number, b: number): string => {
  return '#' + [r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
};

// Helper function to convert RGB to HSL
const rgbToHsl = (r: number, g: number, b: number): { h: number; s: number; l: number } => {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
};

// Helper function to convert HSL to RGB
const hslToRgb = (h: number, s: number, l: number): { r: number; g: number; b: number } => {
  h /= 360;
  s /= 100;
  l /= 100;
  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
};

// Custom Color Picker Component
interface CustomColorPickerProps {
  color: string;
  onChange: (color: string) => void;
}

const CustomColorPicker: React.FC<CustomColorPickerProps> = ({ color, onChange }) => {
  const [hsl, setHsl] = useState(() => {
    const rgb = hexToRgb(color);
    return rgbToHsl(rgb.r, rgb.g, rgb.b);
  });
  const saturationBrightnessRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState<'sb' | 'h' | null>(null);

  const updateColor = useCallback((newHsl: { h: number; s: number; l: number }) => {
    setHsl(newHsl);
    const rgb = hslToRgb(newHsl.h, newHsl.s, newHsl.l);
    onChange(rgbToHex(rgb.r, rgb.g, rgb.b));
  }, [onChange]);

  const handleSaturationBrightnessClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!saturationBrightnessRef.current) return;
    const rect = saturationBrightnessRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    updateColor({ ...hsl, s: x * 100, l: (1 - y) * 100 });
  };

  const handleHueClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!hueRef.current) return;
    const rect = hueRef.current.getBoundingClientRect();
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    updateColor({ ...hsl, h: (1 - y) * 360 });
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging === 'sb' && saturationBrightnessRef.current) {
      const rect = saturationBrightnessRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      updateColor({ ...hsl, s: x * 100, l: (1 - y) * 100 });
    } else if (isDragging === 'h' && hueRef.current) {
      const rect = hueRef.current.getBoundingClientRect();
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      updateColor({ ...hsl, h: (1 - y) * 360 });
    }
  }, [isDragging, hsl, updateColor]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(null);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Update HSL when color prop changes externally
  useEffect(() => {
    const rgb = hexToRgb(color);
    const newHsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    setHsl(newHsl);
  }, [color]);

  const currentRgb = hslToRgb(hsl.h, 100, 50);
  const currentColorHex = rgbToHex(currentRgb.r, currentRgb.g, currentRgb.b);

  return (
    <div className="flex gap-2">
      {/* Saturation/Brightness area */}
      <div
        ref={saturationBrightnessRef}
        className="w-32 h-32 rounded border border-neutral-700 cursor-crosshair relative"
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${currentColorHex})`
        }}
        onClick={handleSaturationBrightnessClick}
        onMouseDown={() => setIsDragging('sb')}
      >
        <div
          className="absolute w-2.5 h-2.5 rounded-full border-2 border-white shadow-lg pointer-events-none"
          style={{
            left: `${hsl.s}%`,
            top: `${100 - hsl.l}%`,
            transform: 'translate(-50%, -50%)'
          }}
        />
      </div>
      {/* Hue slider */}
      <div
        ref={hueRef}
        className="w-5 h-32 rounded border border-neutral-700 cursor-pointer relative"
        style={{
          background: 'linear-gradient(to bottom, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)'
        }}
        onClick={handleHueClick}
        onMouseDown={() => setIsDragging('h')}
      >
        <div
          className="absolute left-0 right-0 w-full h-0.5 border border-white shadow-lg pointer-events-none"
          style={{
            top: `${100 - (hsl.h / 360) * 100}%`,
            transform: 'translateY(-50%)'
          }}
        />
      </div>
    </div>
  );
};

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
  const { userState } = useUserState();
  const [content, setContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [textareaHeight, setTextareaHeight] = useState(60); // Starting height
  const [fontFamily, setFontFamily] = useState('Arial');
  const [fontSize, setFontSize] = useState(48);
  const [textColor, setTextColor] = useState('#FFFFFF'); // Default white
  const [dropShadowColor, setDropShadowColor] = useState('#000000');
  const [dropShadowBlur, setDropShadowBlur] = useState(10);
  const [dropShadowOffsetX, setDropShadowOffsetX] = useState(2);
  const [dropShadowOffsetY, setDropShadowOffsetY] = useState(2);
  const [backgroundColor, setBackgroundColor] = useState('#000000');
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right' | 'justify'>('center');
  const [textStyle, setTextStyle] = useState<'plain' | 'bold' | 'italic' | 'strikethrough'>('plain');
  const [padding, setPadding] = useState(40);
  const [contentRating, setContentRating] = useState<ContentRating>(
    getDefaultContentRating(userState.preferences.ageVerified)
  );
  const [category, setCategory] = useState<FeedCategory | ''>('');
  const [showTextColorPicker, setShowTextColorPicker] = useState(false);
  const [showBackgroundColorPicker, setShowBackgroundColorPicker] = useState(false);
  const [showDropShadowColorPicker, setShowDropShadowColorPicker] = useState(false);
  const textColorButtonRef = useRef<HTMLButtonElement>(null);
  const textColorPickerRef = useRef<HTMLDivElement>(null);
  const backgroundColorButtonRef = useRef<HTMLButtonElement>(null);
  const backgroundColorPickerRef = useRef<HTMLDivElement>(null);
  const dropShadowColorButtonRef = useRef<HTMLButtonElement>(null);
  const dropShadowColorPickerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textColorInputRef = useRef<HTMLInputElement>(null);
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
      
      // Scroll to center the button (use instant scroll on mobile for better performance)
      const isMobile = window.innerWidth < 768;
      container.scrollTo({
        left: newScroll,
        behavior: isMobile ? 'auto' : 'smooth'
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
      },
      contentRating: contentRating,
      category: category || undefined
    };

    onSave(textPost);
  };

  const openPopupMenu = (menuId: string, button: HTMLButtonElement) => {
    const rect = button.getBoundingClientRect();
    setOpenMenu(menuId);
    // Open menu below the button, centered
    setMenuPosition({
      top: rect.bottom,
      left: rect.left + rect.width / 2 // Center horizontally
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
      // Don't close menu if background color picker is open
      if (openMenu === 'background' && showBackgroundColorPicker) {
        return;
      }
      // Don't close menu if shadow color picker is open
      if (openMenu === 'shadow' && showDropShadowColorPicker) {
        return;
      }
      // Don't close if clicking on color picker
      if (backgroundColorPickerRef.current && backgroundColorPickerRef.current.contains(target)) {
        return;
      }
      if (dropShadowColorPickerRef.current && dropShadowColorPickerRef.current.contains(target)) {
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
  }, [openMenu, showBackgroundColorPicker, showDropShadowColorPicker]);

  // Close text color picker when clicking outside
  useEffect(() => {
    if (!showTextColorPicker) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (textColorButtonRef.current && (textColorButtonRef.current.contains(target) || textColorButtonRef.current === target)) {
        return;
      }
      if (textColorPickerRef.current && textColorPickerRef.current.contains(target)) {
        return;
      }
      setShowTextColorPicker(false);
    };

    const timeout = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside, true);
    }, 200);

    return () => {
      clearTimeout(timeout);
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [showTextColorPicker]);

  // Close background color picker when clicking outside
  useEffect(() => {
    if (!showBackgroundColorPicker) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const menuElement = document.querySelector('[data-menu="background"]');
      if (menuElement && menuElement.contains(target)) {
        return;
      }
      if (backgroundColorButtonRef.current && (backgroundColorButtonRef.current.contains(target) || backgroundColorButtonRef.current === target)) {
        return;
      }
      if (backgroundColorPickerRef.current && backgroundColorPickerRef.current.contains(target)) {
        return;
      }
      setShowBackgroundColorPicker(false);
    };

    const timeout = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside, true);
    }, 200);

    return () => {
      clearTimeout(timeout);
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [showBackgroundColorPicker]);

  // Close drop shadow color picker when clicking outside
  useEffect(() => {
    if (!showDropShadowColorPicker) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const menuElement = document.querySelector('[data-menu="shadow"]');
      if (menuElement && menuElement.contains(target)) {
        return;
      }
      if (dropShadowColorButtonRef.current && (dropShadowColorButtonRef.current.contains(target) || dropShadowColorButtonRef.current === target)) {
        return;
      }
      if (dropShadowColorPickerRef.current && dropShadowColorPickerRef.current.contains(target)) {
        return;
      }
      setShowDropShadowColorPicker(false);
    };

    const timeout = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside, true);
    }, 200);

    return () => {
      clearTimeout(timeout);
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [showDropShadowColorPicker]);

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
            <div className="p-3 min-w-[200px]">
              <div className="flex items-center gap-2">
                <label className="text-white text-xs whitespace-nowrap">Size</label>
                <input
                  type="range"
                  min="24"
                  max="72"
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  className="flex-1"
                />
              </div>
            </div>
          );
        case 'shadow':
          return (
            <div className="p-3 min-w-[280px]">
              <div className="flex gap-3 items-center">
                {/* Left column: Color box */}
                <button
                  ref={dropShadowColorButtonRef}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDropShadowColorPicker(!showDropShadowColorPicker);
                  }}
                  className="rounded cursor-pointer relative flex items-center justify-center flex-shrink-0 border border-neutral-700"
                  style={{ 
                    backgroundColor: dropShadowColor,
                    width: '48px',
                    height: '48px'
                  }}
                />
                {/* Right column: Three sliders */}
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-white text-xs whitespace-nowrap">Blur</label>
                    <input
                      type="range"
                      min="0"
                      max="50"
                      value={dropShadowBlur}
                      onChange={(e) => setDropShadowBlur(Number(e.target.value))}
                      className="flex-1"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-white text-xs whitespace-nowrap">X</label>
                    <input
                      type="range"
                      min="-20"
                      max="20"
                      value={dropShadowOffsetX}
                      onChange={(e) => setDropShadowOffsetX(Number(e.target.value))}
                      className="flex-1"
                    />
                    <label className="text-white text-xs whitespace-nowrap">Y</label>
                    <input
                      type="range"
                      min="-20"
                      max="20"
                      value={dropShadowOffsetY}
                      onChange={(e) => setDropShadowOffsetY(Number(e.target.value))}
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>
              {showDropShadowColorPicker && dropShadowColorButtonRef.current && createPortal(
                <div
                  ref={dropShadowColorPickerRef}
                  className="fixed bg-neutral-800 border border-neutral-700 rounded-lg shadow-lg p-3"
                  style={{
                    top: `${dropShadowColorButtonRef.current.getBoundingClientRect().bottom}px`,
                    left: `${dropShadowColorButtonRef.current.getBoundingClientRect().left + dropShadowColorButtonRef.current.getBoundingClientRect().width / 2}px`,
                    transform: 'translateX(-50%)',
                    marginTop: '8px',
                    zIndex: 9999
                  }}
                >
                  <CustomColorPicker
                    color={dropShadowColor}
                    onChange={setDropShadowColor}
                  />
                </div>,
                document.body
              )}
            </div>
          );
        case 'background':
          return (
            <div className="p-2">
              <div className="flex gap-2 items-center">
                <button
                  ref={backgroundColorButtonRef}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowBackgroundColorPicker(!showBackgroundColorPicker);
                  }}
                  className="rounded cursor-pointer relative flex items-center justify-center"
                  style={{ 
                    backgroundColor: backgroundColor,
                    width: '20px',
                    height: '20px'
                  }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 text-white hover:opacity-80 transition-opacity flex items-center justify-center"
                >
                  <ImageIcon className="h-5 w-5" />
                </button>
                {backgroundImage && (
                  <button
                    onClick={() => setBackgroundImage(null)}
                    className="p-2 text-white hover:opacity-80 transition-opacity"
                    title="Remove Image"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {showBackgroundColorPicker && backgroundColorButtonRef.current && createPortal(
                <div
                  ref={backgroundColorPickerRef}
                  className="fixed bg-neutral-800 border border-neutral-700 rounded-lg shadow-lg p-3"
                  style={{
                    top: `${backgroundColorButtonRef.current.getBoundingClientRect().bottom}px`,
                    left: `${backgroundColorButtonRef.current.getBoundingClientRect().left + backgroundColorButtonRef.current.getBoundingClientRect().width / 2}px`,
                    transform: 'translateX(-50%)',
                    marginTop: '8px',
                    zIndex: 9999
                  }}
                >
                  <CustomColorPicker
                    color={backgroundColor}
                    onChange={setBackgroundColor}
                  />
                </div>,
                document.body
              )}
            </div>
          );
        case 'textStyle':
          return (
            <div className="p-2">
              <div className="flex gap-2">
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
                    className={`px-3 py-2 text-white hover:opacity-80 transition-opacity ${
                      textStyle === value ? 'opacity-100' : 'opacity-60'
                    }`}
                    style={style}
                  >
                    <span className="text-lg">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        case 'align':
          return (
            <div className="p-2">
              <div className="flex gap-2">
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
                    className={`p-2 text-white hover:opacity-80 transition-opacity ${
                      textAlign === value ? 'opacity-100' : 'opacity-60'
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
          transform: 'translateX(-50%)', // Center horizontally
          marginTop: '8px' // 8px gap below button
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
          bottom: `calc(64px + ${textareaHeight}px)`,
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
              className="w-full text-center"
              style={{
                fontFamily: fontFamily,
                fontSize: `${fontSize}px`,
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
                // Use responsive padding that maintains layout as screen size changes
                padding: (() => {
                  const viewportWidth = window.innerWidth;
                  const baseViewportWidth = 375; // iPhone base width
                  const paddingScale = viewportWidth / baseViewportWidth;
                  return `${padding * paddingScale}px`;
                })(),
                lineHeight: 1.2,
                wordWrap: 'break-word',
                overflowWrap: 'break-word',
                whiteSpace: 'pre-wrap',
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
      <div className="fixed left-0 right-0 h-14 flex items-center justify-center gap-4 px-4 z-40" style={{ bottom: `calc(64px + ${textareaHeight}px + 48px + 8px)` }}>
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
            ref={textColorButtonRef}
            onClick={() => setShowTextColorPicker(!showTextColorPicker)}
            className="px-2 py-1 transition-opacity hover:opacity-80 flex flex-col items-center gap-0.5 relative"
            style={{ color: 'white' }}
          >
            <span className="text-sm">A</span>
            <div 
              className="w-6 h-0.5"
              style={{ backgroundColor: textColor }}
            />
            {/* Custom Color Picker Popup - Rendered via portal */}
            {showTextColorPicker && textColorButtonRef.current && createPortal(
              <div
                ref={textColorPickerRef}
                className="fixed bg-neutral-800 border border-neutral-700 rounded-lg shadow-lg p-3"
                style={{
                  top: `${textColorButtonRef.current.getBoundingClientRect().bottom}px`,
                  left: `${textColorButtonRef.current.getBoundingClientRect().left + textColorButtonRef.current.getBoundingClientRect().width / 2}px`,
                  transform: 'translateX(-50%)',
                  marginTop: '8px',
                  zIndex: 9999
                }}
              >
                <CustomColorPicker
                  color={textColor}
                  onChange={setTextColor}
                />
              </div>,
              document.body
            )}
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
      <div className="fixed left-0 right-0 h-12 flex items-center justify-center z-40" style={{ bottom: `calc(64px + ${textareaHeight}px + 40px)` }}>
        <div 
          ref={fontSelectorRef}
          className="flex items-center overflow-x-auto w-full px-4"
          style={{ 
            scrollbarWidth: 'none', 
            msOverflowStyle: 'none',
            WebkitOverflowScrolling: 'touch'
          }}
        >
          <div className="flex items-center gap-4 min-w-max">
          {FONT_OPTIONS.map((font) => (
            <button
              key={font.value}
              ref={fontFamily === font.value ? activeFontButtonRef : null}
              onClick={() => setFontFamily(font.value)}
                className="px-3 py-1 transition-opacity hover:opacity-80 relative flex-shrink-0"
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
      </div>

      {/* Text Input - Sticky above bottom nav, auto-expanding */}
      <div 
        className="fixed left-0 right-0 bg-neutral-900 border-t border-neutral-800 z-50" 
        style={{ bottom: '64px' }}
      >
        {/* Emoji Railway - Above text bar */}
        <div className="px-4 pt-2 pb-1">
          <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {['😀', '😂', '❤️', '😍', '🤔', '😮', '😢', '🔥', '👏', '💯', '👍', '👎', '🎉', '🙌', '😊', '😎', '🤗', '😴', '🤯', '🥳'].map((emoji, index) => (
              <button
                key={index}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setContent(prev => prev + emoji);
                }}
                className="text-xl hover:scale-110 transition-transform p-1 flex-shrink-0"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
        
        {/* Text Input Area */}
        <div className="flex items-end gap-2 px-4 pb-4">
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
                setTextareaHeight(newHeight + 32 + 40); // Add padding + emoji railway height
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

        {/* Rating and Category Selection */}
        <div className="px-4 pb-4 space-y-3 border-t border-neutral-700 pt-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Content Rating</label>
              <select
                value={contentRating}
                onChange={(e) => setContentRating(e.target.value as ContentRating)}
                className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {RATING_ORDER.map((rating) => {
                  const ratingInfo = CONTENT_RATINGS[rating];
                  const isDisabled = ratingInfo.requiresVerification && !userState.preferences.ageVerified;
                  return (
                    <option key={rating} value={rating} disabled={isDisabled}>
                      {rating} {isDisabled ? '(Verification Required)' : ''}
                    </option>
                  );
                })}
              </select>
            </div>
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as FeedCategory | '')}
                className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select category</option>
                {FEED_CATEGORY_LIST
                  .filter(cat => cat.id !== 'adults-only' || userState.preferences.ageVerified)
                  .map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>
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
