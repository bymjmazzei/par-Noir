import React, { useState, useEffect } from 'react';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const Logo: React.FC<LogoProps> = ({ className = '', size }) => {
  const [currentTheme, setCurrentTheme] = useState<'dark' | 'light'>('dark');
  
  const sizeClasses = {
    sm: 'w-28 h-28', // Reduced from w-32 h-32
    md: 'w-44 h-44', // Reduced from w-48 h-48
    lg: 'w-60 h-60'  // Reduced from w-64 h-64
  };

  // Use size classes only if size prop is provided, otherwise use full container
  const containerClasses = size ? sizeClasses[size] : 'w-full h-full';

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
    <div className={`flex items-center justify-center ${className} ${containerClasses} overflow-hidden`}>
      <img 
        src={currentTheme === 'dark' ? '/branding/Par-Noir-Logo-White.png' : '/branding/Par-Noir-Logo-Black.png'}
        alt="Par Noir"
        className="w-full h-full object-contain scale-110"
        style={{
          clipPath: 'inset(15% 0 15% 0)'
        }}
      />
    </div>
  );
};

export default Logo; 