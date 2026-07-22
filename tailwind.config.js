/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // As cores semânticas (navy, surface, texto...) vivem como variáveis
      // CSS em src/index.css (--color-*) para que o mesmo componente sirva
      // claro/escuro sem duplicar classes "dark:". Use `bg-[var(--color-surface)]`
      // etc. Aqui ficam só as cores de estado que não mudam com o tema.
      colors: {
        warn: { DEFAULT: '#C98A1E', soft: '#FBF0DD' },
        bad: { DEFAULT: '#C24444', soft: '#FBE9E9' },
        good: { DEFAULT: '#0B6E52', soft: '#E4F6EF' },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['IBM Plex Mono', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
