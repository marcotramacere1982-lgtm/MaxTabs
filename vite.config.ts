import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths so the built app also works when opened from a subfolder.
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist'
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node'
  }
});
