import { createHash, timingSafeEqual } from 'node:crypto'
import { createMiddleware } from 'hono/factory'

/**
 * Usuário único, sem login: a API exige `Authorization: Bearer <API_TOKEN>`.
 * Sem a variável configurada, recusa tudo (falha fechada).
 */
export const requireToken = createMiddleware(async (c, next) => {
  const expected = process.env.API_TOKEN
  if (!expected) return c.json({ error: 'API_TOKEN não configurado no servidor' }, 500)

  const header = c.req.header('authorization') ?? ''
  const given = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!given || !sameSecret(given, expected)) {
    return c.json({ error: 'Chave de acesso inválida' }, 401)
  }
  await next()
})

/** Compara em tempo constante; o hash iguala os tamanhos. */
function sameSecret(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}
