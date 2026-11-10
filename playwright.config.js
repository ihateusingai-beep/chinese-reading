import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 30000,
  use: {
    headless: true,
    // 學生端用 iPad / Windows 平板；呢度用桌面 viewport 做版面量度
    viewport: { width: 1024, height: 768 },
  },
});
