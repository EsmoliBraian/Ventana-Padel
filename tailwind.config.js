/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Color principal: el violeta de la marca. Los valores estan en
        // src/index.css (variables --brand-*); aca solo se les pone nombre.
        //   500 relleno (texto blanco) · 400 relleno al pasar el cursor
        //   300 bordes y foco · 200 texto, enlaces e iconos sobre fondo oscuro
        primary: {
          DEFAULT: 'rgb(var(--brand) / <alpha-value>)',
          200: 'rgb(var(--brand-light) / <alpha-value>)',
          300: 'rgb(var(--brand-edge) / <alpha-value>)',
          400: 'rgb(var(--brand-hover) / <alpha-value>)',
          500: 'rgb(var(--brand) / <alpha-value>)',
        },
        brand: {
          DEFAULT: '#3735A9',
          50:  '#EEEDFB',
          100: '#D4D2F3',
          200: '#B0ACE8',
          300: '#8B85DC',
          400: '#6560C6',
          500: '#3735A9',
          600: '#2E2C8F',
          700: '#252374',
          800: '#1C1A59',
          900: '#131240',
        },
        gray: {
          50:  '#F5F5F5',
          100: '#EFEFEF',
          200: '#DEDEDE',
          300: '#C5C7CB',
          400: '#94979E',
          500: '#7B7F86',
          600: '#666B73',
          700: '#393B42',
          800: '#383A40',
          900: '#222325',
          925: '#1C1D21',
          950: '#121212',
        },
        // Mostrador: colores tomados de variables de tema (src/index.css).
        mo: {
          bg: 'rgb(var(--mo-bg) / <alpha-value>)',
          surface: 'rgb(var(--mo-surface) / <alpha-value>)',
          'surface-alt': 'rgb(var(--mo-surface-alt) / <alpha-value>)',
          header: 'rgb(var(--mo-header) / <alpha-value>)',
          border: 'rgb(var(--mo-border) / <alpha-value>)',
          text: 'rgb(var(--mo-text) / <alpha-value>)',
          muted: 'rgb(var(--mo-text-muted) / <alpha-value>)',
          accent: 'rgb(var(--mo-accent) / <alpha-value>)',
          'accent-contrast': 'rgb(var(--mo-accent-contrast) / <alpha-value>)',
          'accent-text': 'rgb(var(--mo-accent-text) / <alpha-value>)',
          open: 'rgb(var(--mo-open) / <alpha-value>)',
          closed: 'rgb(var(--mo-closed) / <alpha-value>)',
          pending: 'rgb(var(--mo-pending) / <alpha-value>)',
          danger: 'rgb(var(--mo-danger) / <alpha-value>)',
        },
        // Estados: señales sobrias, siempre acompañadas de texto o icono.
        success: { DEFAULT: '#6FCF97', bg: '#12301F', border: '#2E8B57', icon: '#4CC38A' },
        warning: { DEFAULT: '#FFD783', bg: '#3A2B10', border: '#F6B73C', icon: '#FFC857' },
        danger:  { DEFAULT: '#FFB4B4', bg: '#3A1717', border: '#E05252', icon: '#FF6666' },
        info:    { DEFAULT: '#A9D7FF', bg: '#132D44', border: '#4CA8FF', icon: '#59B2FF' },
      },
      fontFamily: {
        sans: ['Geist Sans', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        lg: '0.75rem',
      },
      boxShadow: {
        'glow-primary': '0 0 20px rgb(var(--brand) / 0.35)',
        'glow-sm':      '0 0 10px rgb(var(--brand) / 0.22)',
        card: '0 1px 2px rgba(0, 0, 0, 0.3), 0 1px 1px rgba(0, 0, 0, 0.2)',
      },
    },
  },
  plugins: [],
}
