/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"Plus Jakarta Sans"', 'Segoe UI', 'system-ui', 'sans-serif'] },
      colors: {
        ink: '#0F1E3D',
        muted: '#5B6B82',
        line: '#E2E8F0',
        canvas: '#F4F7FB',
        brand: { 50: '#EEF3FE', 100: '#E3EBFC', 200: '#C7D7FA', 500: '#2563EB', 600: '#1D4ED8', 700: '#1E40AF', 900: '#0F1E3D' },
        gold: '#D9A63A'
      },
      borderRadius: { xl: '14px', '2xl': '18px' }
    }
  },
  plugins: []
};
