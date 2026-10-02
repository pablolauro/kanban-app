import { neon, type NeonQueryFunction } from '@neondatabase/serverless'

/**
 * Cliente HTTP do Neon. Cada chamada é um request independente — ideal para
 * Vercel Functions, onde não existe processo vivo para manter um pool.
 *
 * Lazy para que importar o módulo (typecheck, build) não exija a variável.
 */
let client: NeonQueryFunction<false, false> | null = null

export function sql(): NeonQueryFunction<false, false> {
  if (!client) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL não configurada')
    client = neon(url)
  }
  return client
}

/**
 * Repete UMA vez em falha de rede (`fetch failed` — socket keep-alive
 * derrubado pelo proxy do Neon). Só para leituras: numa escrita a conexão
 * pode cair depois do commit, e repetir duplicaria o efeito.
 */
export async function retryRead<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (err) {
    if (!isNetworkError(err)) throw err
    return run()
  }
}

function isNetworkError(err: unknown): boolean {
  const source = (err as { sourceError?: unknown }).sourceError
  return source instanceof TypeError && source.message === 'fetch failed'
}

/**
 * SELECTs já no formato do domínio (camelCase).
 *
 * Datas (`date`) saem como texto: o parser padrão do driver as converteria em
 * `Date` à meia-noite do fuso do servidor, e o front espera `YYYY-MM-DD` puro.
 */
export const SELECT_BOARD = `
  select id, title, created_at as "createdAt", updated_at as "updatedAt"
    from boards order by created_at limit 1`

export const SELECT_COLUMNS = `
  select id, board_id as "boardId", title, accent, wip_limit as "wipLimit",
         is_done as "isDone", position, created_at as "createdAt"
    from columns where board_id = $1`

export const SELECT_CARDS = `
  select c.id, c.column_id as "columnId", c.title, c.description, c.priority,
         c.due_date::text as "dueDate", c.completed_at::text as "completedAt",
         c.tags, c.position, c.created_at as "createdAt", c.updated_at as "updatedAt"
    from cards c join columns col on col.id = c.column_id
   where col.board_id = $1`

/**
 * INSERTs em lote via `jsonb_to_recordset`: N linhas em um único comando,
 * inclusive `tags text[]` (que `unnest` achataria). Recebe o array em JSON.
 */
export const INSERT_COLUMNS = `
  insert into columns (id, board_id, title, accent, wip_limit, is_done, position, created_at)
  select id, "boardId", title, accent, "wipLimit", "isDone", position, "createdAt"
    from jsonb_to_recordset($1::jsonb) as x(
      id uuid, "boardId" uuid, title text, accent text, "wipLimit" int,
      "isDone" boolean, position float8, "createdAt" timestamptz)`

export const INSERT_CARDS = `
  insert into cards (id, column_id, title, description, priority, due_date,
                     completed_at, tags, position, created_at, updated_at)
  select id, "columnId", title, description, priority, "dueDate",
         "completedAt", tags, position, "createdAt", "updatedAt"
    from jsonb_to_recordset($1::jsonb) as x(
      id uuid, "columnId" uuid, title text, description text, priority text,
      "dueDate" date, "completedAt" date, tags text[], position float8,
      "createdAt" timestamptz, "updatedAt" timestamptz)`

/** Toda escrita "toca" o board, como o localStorage fazia. Quadro único. */
export const TOUCH_BOARD = `update boards set updated_at = now()`
