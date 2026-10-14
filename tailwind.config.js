/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Семантические цвета редактора (значения — в src/index.css, светлая и тёмная темы).
      colors: {
        app: token('app'),
        panel: token('panel'),
        sunken: token('sunken'),
        raised: token('raised'),
        hover: token('hover'),
        line: token('line'),
        'line-strong': token('line-strong'),
        fg: token('fg'),
        'fg-muted': token('fg-muted'),
        'fg-subtle': token('fg-subtle'),
        accent: token('accent'),
        'accent-hover': token('accent-hover'),
        'accent-fg': token('accent-fg'),
        'accent-soft': token('accent-soft'),
        'accent-text': token('accent-text'),
        danger: token('danger'),
        'danger-soft': token('danger-soft'),
        warning: token('warning'),
        'warning-soft': token('warning-soft'),
        success: token('success'),
        'success-soft': token('success-soft'),
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['11px', '16px'],
        xs: ['12px', '16px'],
        sm: ['13px', '20px'],
        base: ['14px', '22px'],
      },
      boxShadow: {
        panel: '0 1px 2px rgb(var(--c-shadow) / 0.06)',
        pop: '0 8px 28px rgb(var(--c-shadow) / 0.18), 0 1px 3px rgb(var(--c-shadow) / 0.12)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'pop-in': {
          from: { opacity: '0', transform: 'translate(-50%, -48%) scale(0.98)' },
          to: { opacity: '1', transform: 'translate(-50%, -50%) scale(1)' },
        },
        'slide-down': { from: { opacity: '0', transform: 'translateY(-2px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
      },
      animation: {
        'fade-in': 'fade-in 120ms ease-out',
        'pop-in': 'pop-in 140ms ease-out',
        'slide-down': 'slide-down 100ms ease-out',
      },
    },
  },
  plugins: [],
};
