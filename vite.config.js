import { defineConfig } from 'vite'

export default defineConfig({
  root: './src',
  build: {
    outDir: '../dist'
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3001'
    }
  }
})
