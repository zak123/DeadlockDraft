/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        amber: {
          DEFAULT: '#F59E0B',
          dark: '#D97706',
        },
        sapphire: {
          DEFAULT: '#3B82F6',
          dark: '#2563EB',
        },
        deadlock: {
          bg: '#0D0D0D',
          card: '#1A1A1A',
          border: '#2D2D2D',
          text: '#E5E5E5',
          muted: '#737373',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
