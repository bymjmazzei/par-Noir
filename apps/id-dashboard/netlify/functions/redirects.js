exports.handler = async (event, context) => {
  const { path } = event;
  
  // PWA files that should be served directly
  const pwaFiles = [
    '/sw.js',
    '/manifest.json',
    '/favicon.png'
  ];
  
  // Check if this is a PWA file
  if (pwaFiles.includes(path)) {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': path.endsWith('.js') ? 'application/javascript' : 
                       path.endsWith('.json') ? 'application/json' :
                       'image/png',
        'Service-Worker-Allowed': path === '/sw.js' ? '/' : undefined
      },
      body: `Redirecting to ${path}`
    };
  }
  
  // Check if this is an icon file
  if (path.startsWith('/icons/')) {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'image/png'
      },
      body: `Redirecting to ${path}`
    };
  }
  
  // Check if this is an asset file
  if (path.startsWith('/assets/')) {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/javascript'
      },
      body: `Redirecting to ${path}`
    };
  }
  
  // Default: serve index.html for SPA
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html'
    },
    body: 'Serving SPA'
  };
};
