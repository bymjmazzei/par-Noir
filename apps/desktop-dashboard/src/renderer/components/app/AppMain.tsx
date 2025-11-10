import React from 'react';

import App from '../../../../../id-dashboard/src/App';
import { OAuthHandler } from '../../../../../id-dashboard/src/components/OAuthHandler';

import '../../../../../id-dashboard/src/index.css';

export const AppMain: React.FC = () => {
  React.useEffect(() => {
    const darkBg = "url('./branding/Par-Noir-Background-Dark.png')";
    const lightBg = "url('./branding/Par-Noir-Background-Light.png')";

    document.documentElement.style.setProperty('--pn-bg-dark', darkBg);
    document.documentElement.style.setProperty('--pn-bg-light', lightBg);

    document.body.classList.add('theme-dark', 'bg-bg-primary', 'min-h-screen');

    return () => {
      document.documentElement.style.removeProperty('--pn-bg-dark');
      document.documentElement.style.removeProperty('--pn-bg-light');
      document.body.classList.remove('theme-dark', 'bg-bg-primary', 'min-h-screen');
    };
  }, []);

  return (
    <>
      <App />
      <OAuthHandler />
    </>
  );
};

export default AppMain;

