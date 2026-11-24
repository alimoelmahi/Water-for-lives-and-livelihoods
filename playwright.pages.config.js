import { defineConfig } from '@playwright/test';

const baseURL = 'http://127.0.0.1:5175/Water-for-lives-and-livelihoods/';

export default defineConfig({
  testDir: './test/browser',
  testMatch: '**/retirement.spec.js',
  fullyParallel: true,
  use: {
    baseURL,
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run preview -- --port 5175 --strictPort --base /Water-for-lives-and-livelihoods/',
    url: baseURL,
    reuseExistingServer: false,
  },
});
