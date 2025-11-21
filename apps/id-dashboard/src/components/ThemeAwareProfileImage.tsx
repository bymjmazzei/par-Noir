import React, { useState, useEffect } from 'react';
import { getAssetUrl } from '../utils/assetPaths';

interface ThemeAwareProfileImageProps {
  className?: string;
  alt?: string;
  profilePicture?: string; // URL to profile picture (e.g., from top post)
}

export const ThemeAwareProfileImage: React.FC<ThemeAwareProfileImageProps> = ({ 
  className = '', 
  alt = "Default profile picture",
  profilePicture
}) => {
  const [currentTheme, setCurrentTheme] = useState<'dark' | 'light'>('dark');
  const [imageError, setImageError] = useState(false);
  
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

  // Reset error when profilePicture changes
  useEffect(() => {
    setImageError(false);
  }, [profilePicture]);

  // If profile picture is provided and hasn't errored, use it
  if (profilePicture && !imageError) {
    return (
      <img
        src={profilePicture}
        alt={alt}
        className={className}
        onError={() => setImageError(true)}
      />
    );
  }

  // Fallback to default icon
  return (
    <img
      src={currentTheme === 'dark'
        ? getAssetUrl('branding/Par-Noir-Icon-White.png')
        : getAssetUrl('branding/Par-Noir-Icon-Black.png')}
      alt={alt}
      className={className}
    />
  );
};

export default ThemeAwareProfileImage;
