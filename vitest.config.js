import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
    globals: false,
    // ⚠️ v8 coverage 對「單檔 HTML 入面嘅 inline <script>」量唔到
    //    （實測：sourceURL pragma + include glob 都試過，報告係 0%）
    //    見 docs/TEST-PLAN.md §7.2 —— 而家改用「已實作模組必須有對應測試檔」守門（T10）。
    //    M1 尾再評估 istanbul / import 方案，量到再設 threshold = 實際值 − 3pp。
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // thresholds: { lines: 69, functions: 69, branches: 66, statements: 69 },
    },
  },
});
