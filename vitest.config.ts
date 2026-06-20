import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    env: {
      VITE_GOOGLE_PLACES_API_KEY: 'test-key',
    },
  },
})
