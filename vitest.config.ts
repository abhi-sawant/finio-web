import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Deliberately separate from vite.config.ts: the unit suite covers pure money logic and
// has no need for the React, Tailwind or PWA plugins.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
