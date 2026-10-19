/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative base so the build can later be served from a sub-path (e.g. GitHub Pages).
  base: './',
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
