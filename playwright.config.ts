import { defineConfig } from '@playwright/test';

// Two builds are served: the default build (LiveData feature OFF) and a build with the experimental
// flag ON, written to a separate output directory so the two never overwrite each other.
export default defineConfig({
  testDir: 'e2e',
  projects: [
    { name: 'default', testMatch: /studio\.spec\.ts/, use: { baseURL: 'http://localhost:4173' } },
    { name: 'live', testMatch: /livedata\.spec\.ts/, use: { baseURL: 'http://localhost:4174' } },
  ],
  use: {
    // Optional: use a pre-installed Chromium (e.g. CI image) instead of Playwright's own download.
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: [
    {
      command: 'npm run build && npm run preview -- --port 4173 --strictPort --bypass-lock',
      url: 'http://localhost:4173',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'npm run build -- --outDir dist-live --emptyOutDir && npm run preview -- --outDir dist-live --port 4174 --strictPort --bypass-lock',
      url: 'http://localhost:4174',
      reuseExistingServer: true,
      timeout: 120_000,
      env: { VITE_EXPERIMENTAL_EXCEL_LIVE: 'true' },
    },
  ],
});
