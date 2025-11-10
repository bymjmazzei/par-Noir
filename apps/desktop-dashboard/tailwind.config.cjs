const path = require('path');

module.exports = {
  content: [
    path.resolve(__dirname, 'index.html'),
    path.resolve(__dirname, 'src/renderer/**/*.{js,ts,jsx,tsx,html}'),
    path.resolve(__dirname, '../id-dashboard/index.html'),
    path.resolve(__dirname, '../id-dashboard/src/**/*.{js,ts,jsx,tsx,html}')
  ],
  theme: {
    extend: {
      colors: {
        'bg-primary': 'var(--bg-primary)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        border: 'var(--border)',
        'modal-bg': 'var(--modal-bg)',
        'input-bg': 'var(--input-bg)',
        'input-border': 'var(--input-border)',
        hover: 'var(--hover)',
        primary: 'var(--primary)',
        secondary: 'var(--secondary)',
        accent: 'var(--accent)'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
};
