import React, { useEffect } from 'react';

export const OAuthHandler: React.FC = () => {
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Handle OAuth success/error messages
      if (event.data.type === 'GOOGLE_AUTH_SUCCESS') {
        // Notify parent window
        window.parent.postMessage({
          type: 'GOOGLE_AUTH_SUCCESS',
          userId: event.data.userId
        }, '*');
      } else if (event.data.type === 'GOOGLE_AUTH_ERROR') {
        window.parent.postMessage({
          type: 'GOOGLE_AUTH_ERROR',
          error: event.data.error
        }, '*');
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return null;
};
