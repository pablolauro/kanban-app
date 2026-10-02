import { handle } from 'hono/vercel'
import { app } from '../server/app.js'

/**
 * Vercel Function única para toda a API. O `vercel.json` reescreve /api/* para
 * cá; a URL original é preservada, então o roteamento fica todo no Hono.
 */
const handler = handle(app)

export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler
