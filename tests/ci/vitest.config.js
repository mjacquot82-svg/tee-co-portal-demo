import path from 'node:path';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  envDir: path.resolve('tests/ci'),
  test: { environment: 'jsdom', globals: true, include: ['src/**/*.test.{ts,tsx}'], maxWorkers: 1, fileParallelism: false },
});
