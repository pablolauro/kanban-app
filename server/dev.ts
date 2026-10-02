import { serve } from '@hono/node-server'
import { app } from './app.js'

/**
 * Servidor local. Em produção a mesma `app` roda como Vercel Function
 * (api/index.ts); aqui o Vite faz proxy de /api para esta porta.
 */
const port = Number(process.env.API_PORT ?? 3000)

serve({ fetch: app.fetch, port }, () => {
  console.log(`API em http://localhost:${port}/api`)
})
