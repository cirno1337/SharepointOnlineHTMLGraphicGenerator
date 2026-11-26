/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const version = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;

function gitBuild(): string {
  try {
    const sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const dirty = execSync('git status --porcelain', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() !== '';
    return `${version}+${sha}${dirty ? '.dirty' : ''}`;
  } catch {
    return `${version}+nogit`;
  }
}

// The editor is a Vite app. The *exported* page is produced by src/core/export
// as a static string and never includes anything from this bundle.
export default defineConfig({
  plugins: [react()],
  define: { __STUDIO_VERSION__: JSON.stringify(version), __STUDIO_BUILD__: JSON.stringify(gitBuild()) },
  build: { sourcemap: false },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
  },
});
