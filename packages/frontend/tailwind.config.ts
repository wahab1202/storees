import type { Config } from 'tailwindcss'
import tailwindAnimate from 'tailwindcss-animate'

const config: Config = {
  content: [
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        sidebar: {
          DEFAULT: '#0F1D40',
          hover: '#1A2A52',
          active: '#D9A441',
          text: '#FFFFFF',
          muted: '#94A3B8',
        },
        accent: {
          DEFAULT: '#D9A441',
          hover: '#C4922E',
        },
        heading: '#0F1D40',
        surface: {
          DEFAULT: '#F9FAFB',
          elevated: '#FFFFFF',
        },
        border: '#E5E7EB',
        'border-focus': '#D9A441',
        'text-primary': '#212121',
        'text-secondary': '#6B7280',
        'text-muted': '#9CA3AF',
      },
    },
  },
  plugins: [tailwindAnimate],
}

export default config
