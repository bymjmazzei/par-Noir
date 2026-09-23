/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    '../../packages/feed-tile/src/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Source Serif 4"', 'Georgia', 'serif'],
        ui: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        paper: '0 1px 2px rgba(15,23,42,0.04), 0 12px 40px rgba(15,23,42,0.08)',
      },
      colors: {
        paper: '#f7f6f3',
        ink: '#1c1917',
        mute: '#78716c',
        line: '#e7e5e4',
        accent: '#0f766e',
      },
    },
  },
  plugins: [],
};
