import React, { useState, useEffect } from 'react';
import { getAssetUrl } from '../utils/assetPaths';

interface IconProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const Icon: React.FC<IconProps> = ({ className = '', size = 'md' }) => {
  const [currentTheme, setCurrentTheme] = useState<'dark' | 'light'>('dark');
  const iconSources = {
    dark: getAssetUrl('branding/Par-Noir-Icon-White.png'),
    light: getAssetUrl('branding/Par-Noir-Icon-Black.png')
  } as const;
  
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-12 h-12'
  };

  useEffect(() => {
    // Function to update theme
    const updateTheme = () => {
      const isDarkTheme = document.documentElement.className.includes('theme-dark');
      setCurrentTheme(isDarkTheme ? 'dark' : 'light');
    };

    // Initial theme check
    updateTheme();

    // Listen for theme changes
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div className={`${className} ${sizeClasses[size]}`}>
      <img 
        src={iconSources[currentTheme]}
        alt="Par Noir Icon"
        className="w-full h-full object-contain"
      />
    </div>
  );
};

export default Icon; 