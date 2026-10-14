import { defineConfig } from '@playwright/test';

// Десктопное приложение: npm run build && xvfb-run -a npm run test:desktop
// FACET_ELECTRON_BIN — путь к собранному приложению (например release/linux-unpacked/facet-os).
export default defineConfig({
  testDir: './e2e-desktop',
  timeout: 120_000,
  workers: 1,
  reporter: 'list',
  use: { trace: 'retain-on-failure' },
});
