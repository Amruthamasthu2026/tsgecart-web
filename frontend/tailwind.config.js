/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand palette — primary yellow, near-black ink, white background
        brand: {
          DEFAULT: '#FFE60D',
          50: '#FFFDE7',
          100: '#FFF9C4',
          200: '#FFF39B',
          300: '#FFEC6B',
          400: '#FFE63D',
          500: '#FFE60D',
          600: '#F5CE00',
          700: '#D4A800',
          800: '#A88400',
          900: '#7A5F00',
        },
        // Deep navy-ink used for headings on the old site
        ink: {
          DEFAULT: '#0F172A',
          soft: '#1E293B',
          muted: '#64748B',
        },
        // Category / status badge colors
        badge: {
          trending: '#F43F5E',
          popular: '#F97316',
          premium: '#8B5CF6',
          organic: '#16A34A',
          stock: '#16A34A',
        },
      },
      fontFamily: {
        sans: ['Poppins', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.25rem',
        '3xl': '1.75rem',
        '4xl': '2.25rem',
      },
      boxShadow: {
        card: '0 10px 30px -12px rgba(15, 23, 42, 0.12)',
        'card-hover': '0 20px 40px -16px rgba(15, 23, 42, 0.22)',
        soft: '0 4px 20px rgba(15, 23, 42, 0.06)',
        blob: '0 8px 20px -6px rgba(245, 206, 0, 0.6)',
        nav: '0 2px 16px rgba(15, 23, 42, 0.06)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        sparkle: {
          '0%,100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.4', transform: 'scale(0.8)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.5s ease-out',
        shimmer: 'shimmer 1.5s infinite',
        float: 'float 3s ease-in-out infinite',
        sparkle: 'sparkle 1.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
