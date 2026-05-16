import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/unit/**/*.spec.ts'],
    pool: 'forks',
  },
  resolve: {
    alias: {
      // Espelha o mapeamento do Metro (extraNodeModules.src em metro.config.js).
      // Permite o store importar `../services/biometric-lock` resolvendo no
      // mesmo source tree usado em produção.
      src: path.resolve(__dirname, 'app/_src'),
      '@': path.resolve(__dirname, 'app/_src'),
    },
  },
});
