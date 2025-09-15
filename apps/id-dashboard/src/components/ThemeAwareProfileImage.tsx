import React, { useState, useEffect } from 'react';

interface ThemeAwareProfileImageProps {
  className?: string;
  alt?: string;
}

export const ThemeAwareProfileImage: React.FC<ThemeAwareProfileImageProps> = ({ 
  className = '', 
  alt = "Default profile picture" 
}) => {
  const [currentTheme, setCurrentTheme] = useState<'dark' | 'light'>('dark');
  
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
    <img
      src={currentTheme === 'dark' ? '/branding/Par-Noir-Icon-White.png' : '/branding/Par-Noir-Icon-Black.png'}
      alt={alt}
      className={className}
    />
  );
};

export default ThemeAwareProfileImage;
