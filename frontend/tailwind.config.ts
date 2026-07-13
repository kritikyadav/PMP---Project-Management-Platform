// frontend/tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: 'var(--base)',
        subtle: 'var(--subtle)',
        surface: {
          1: 'var(--surface-1)',
          2: 'var(--surface-2)',
          3: 'var(--surface-3)',
          4: 'var(--surface-4)',
          5: 'var(--surface-5)',
        },
        pip: {
          border: 'var(--pip-border)',
          'border-subtle': 'var(--pip-border-subtle)',
          text: 'var(--pip-text)',
          secondary: 'var(--pip-secondary)',
          muted: 'var(--pip-muted)',
          accent: 'var(--pip-accent)',
          'accent-dim': 'var(--pip-accent-dim)',
        },
        rag: {
          'green-bg': 'var(--rag-green-bg)',
          'green-text': 'var(--rag-green-text)',
          'amber-bg': 'var(--rag-amber-bg)',
          'amber-text': 'var(--rag-amber-text)',
          'red-bg': 'var(--rag-red-bg)',
          'red-text': 'var(--rag-red-text)',
        },
        err: {
          bg: 'var(--err-bg)',
          text: 'var(--err-text)',
        },
        inverted: 'var(--inverted)',
      },
      fontFamily: {
        sora: ['Sora', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
      },
      borderRadius: {
        card: '8px',
        'card-lg': '12px',
      },
      boxShadow: {
        card: 'var(--card-shadow)',
        'card-elevated': 'var(--card-shadow-elevated)',
      },
    },
  },
  plugins: [],
};

export default config;
