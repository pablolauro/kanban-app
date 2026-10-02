import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Em dev a API roda à parte (npm run dev:api → server/dev.ts); na Vercel,
    // /api é a própria Function, mesma origem — por isso o front usa '/api'.
    proxy: { '/api': `http://localhost:${process.env.API_PORT ?? 3000}` },
  },
})
