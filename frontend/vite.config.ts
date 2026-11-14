/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  // Where `pnpm dev` forwards the API (frontend/.env: API_URL). In production CloudFront does this (infra/main.tf).
  const api = loadEnv(mode, process.cwd(), '').API_URL || 'http://localhost:8000'
  return {
    // The router plugin must run before react() so it can generate src/routeTree.gen.ts.
    plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
    // Same origin as the API (ADR-1): the session cookie works with no CORS. xfwd passes the client IP on.
    server: { proxy: { '/api': { target: api, xfwd: true }, '/o': { target: api, xfwd: true } } },
  }
})
