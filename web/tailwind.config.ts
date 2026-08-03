import type { Config } from 'tailwindcss';

// Tokens live in styles/tokens.css so they're available to plain CSS too.
// We re-export them under tailwind for utility usage.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Surface: warm-neutral near-black with bone-white. Restrained.
        surface: { DEFAULT: '#0E0E10', raised: '#16161A', sunken: '#070708', line: '#222226' },
        ink: { DEFAULT: '#F5F1EA', muted: '#B7B0A4', dim: '#7A7468' },
        accent: { DEFAULT: '#C9A86A', deep: '#9F7E3F', glow: '#E8C97A' }, // brass — never neon
        semantic: { gain: '#5E8C61', loss: '#A24E4E', warn: '#B4832D' }
      },
      fontFamily: {
        sans: ['"Inter"', 'ui-sans-serif', 'system-ui'],
        serif: ['"Cormorant Garamond"', 'ui-serif', 'Georgia'],
        mono: ['"JetBrains Mono"', 'ui-monospace']
      },
      letterSpacing: { tightest: '-0.045em', tighter: '-0.025em', tight: '-0.015em' },
      // No drop-shadow utilities — we use real light, never fake shadow.
      boxShadow: { none: 'none' }
    }
  },
  plugins: []
};
export default config;
