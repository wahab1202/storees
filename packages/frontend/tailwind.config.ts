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
          DEFAULT: '#0D1138',
          hover: '#181F5C',
          active: '#4F46E5',
          text: '#FFFFFF',
          muted: '#8B93C9',
        },
        accent: {
          DEFAULT: '#4F46E5',
          hover: '#4338CA',
        },
        heading: '#0D1138',
        surface: {
          DEFAULT: '#F5F6FF',
          elevated: '#FFFFFF',
        },
        border: '#E5E7EB',
        'border-focus': '#4F46E5',
        'text-primary': '#1A1A2E',
        'text-secondary': '#6B7280',
        'text-muted': '#9CA3AF',
      },
    },
  },
  plugins: [tailwindAnimate],
}

export default config
