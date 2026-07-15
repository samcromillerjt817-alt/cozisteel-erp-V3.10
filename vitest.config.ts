import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/**/*.test.ts'],
    // Testes de integração escrevem no mesmo arquivo SQLite de teste — evita
    // condição de corrida entre arquivos de teste rodando em paralelo.
    fileParallelism: false,
  },
})
