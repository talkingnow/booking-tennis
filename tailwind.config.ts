import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0f172a',
        panel: '#1e293b',
        accent: '#22d3ee',
      },
    },
  },
  plugins: [],
} satisfies Config;
