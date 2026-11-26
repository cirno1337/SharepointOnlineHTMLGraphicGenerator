/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The editor is a Vite app. The *exported* page is produced by src/core/export
// as a static string and never includes anything from this bundle.
export default defineConfig({
  plugins: [react()],
  build: { sourcemap: false },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
  },
});
