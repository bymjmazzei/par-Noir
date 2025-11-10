import React from 'react';

import App from '../../../../../id-dashboard/src/App';
import { OAuthHandler } from '../../../../../id-dashboard/src/components/OAuthHandler';

import '../../../../../id-dashboard/src/index.css';

export const AppMain: React.FC = () => {
  React.useEffect(() => {
    const baseUrl = import.meta.env.BASE_URL || '/';
    const darkBg = `url('${baseUrl}branding/Par-Noir-Background-Dark.png')`;
    const lightBg = `url('${baseUrl}branding/Par-Noir-Background-Light.png')`;
    document.documentElement.style.setProperty('--pn-bg-dark', darkBg);
    document.documentElement.style.setProperty('--pn-bg-light', lightBg);

    return () => {
      document.documentElement.style.removeProperty('--pn-bg-dark');
      document.documentElement.style.removeProperty('--pn-bg-light');
    };
  }, []);

  return (
    <div className="theme-dark">
      <App />
      <OAuthHandler />
    </div>
  );
};

export default AppMain;

