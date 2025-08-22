import React, { useState, useEffect } from 'react';
import { Icon } from './Icon';

type Theme = 'dark' | 'light';

interface ThemeSwitcherProps {
  className?: string;
}

export const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({ className = '' }) => {
  const [currentTheme, setCurrentTheme] = useState<Theme>('dark');

  useEffect(() => {
    // Load saved theme or default to dark
    const savedTheme = localStorage.getItem('theme') as Theme;
    if (savedTheme && (savedTheme === 'dark' || savedTheme === 'light')) {
      setCurrentTheme(savedTheme);
    } else {
      setCurrentTheme('dark'); // Default to dark
    }
  }, []);

  useEffect(() => {
    // Apply theme to document
    document.documentElement.className = `theme-${currentTheme}`;
    localStorage.setItem('theme', currentTheme);
  }, [currentTheme]);




  const handleThemeToggle = () => {
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setCurrentTheme(newTheme);
  };

  return (
    <div className={`ThemeSwitcher ${className}`}>
      <button
        onClick={handleThemeToggle}
        className="dos-button flex items-center justify-center p-2 rounded-md transition-all duration-300 border border-border hover:bg-hover"
        title={`Switch to ${currentTheme === 'dark' ? 'Light' : 'Dark'} theme`}
      >
        <Icon 
          size="sm" 
          className={currentTheme === 'dark' ? 'text-white' : 'text-black'} 
        />
      </button>
    </div>
  );
};

export default ThemeSwitcher; 