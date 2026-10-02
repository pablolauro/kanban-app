import type { NeonQueryFunctionInTransaction } from '@neondatabase/serverless'
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import type { BoardSnapshot } from '../src/domain/types.js'
import { requireToken } from './auth.js'
import {
  INSERT_CARDS,
  INSERT_COLUMNS,
  SELECT_BOARD,
  SELECT_CARDS,
  SELECT_COLUMNS,
  TOUCH_BOARD,
  retryRead,
  sql,
} from './db.js'
import {
  cardPatchSchema,
  cardPositionsSchema,
  cardSchema,
  cardsBatchSchema,
  columnPatchSchema,
  columnPositionsSchema,
  columnSchema,
  idSchema,
  renameBoardSchema,
  snapshotSchema,
} from './schemas.js'

/**
 * API do quadro. As rotas espelham 1:1 o `HttpBoardRepository` do front —
 * o contrato é o `BoardRepository` (src/data/repository.ts).
 *
 * Escritas com mais de um comando vão num `sql().transaction([...])`: o Neon
 * HTTP executa todos numa transação só, ou nenhum.
 */
export const app = new Hono().basePath('/api')

app.use('*', requireToken)

// --- board -------------------------------------------------------------

app.get('/boards/current', async (c) => {
  const snapshot = await retryRead(loadSnapshot)
  if (!snapshot) return c.json({ error: 'Nenhum quadro salvo' }, 404)
  return c.json(snapshot)
})

app.patch('/boards/current', async (c) => {
  const { title } = await body(c, renameBoardSchema)
  const rows = await sql().query(
    'update boards set title = $1, updated_at = now() returning id',
    [title],
  )
  return rows.length ? c.body(null, 204) : notFound(c, 'quadro')
})

/**
 * Migração do localStorage: grava o snapshot SÓ se o banco estiver vazio.
 * Um segundo navegador com outro quadro local recebe 409 em vez de
 * sobrescrever o que já subiu. (O índice `boards_singleton` fecha a corrida.)
 */
app.post('/boards/import', async (c) => {
  const snapshot = await body(c, snapshotSchema)
  const existing = await sql().query('select 1 from boards limit 1')
  if (existing.length) return c.json({ error: 'Já existe um quadro no servidor' }, 409)
  await sql().transaction((tx) => insertSnapshot(tx, snapshot))
  return c.body(null, 204)
})

/** Importar JSON / recomeçar quadro: substitui tudo, atomicamente. */
app.put('/boards/current', async (c) => {
  const snapshot = await body(c, snapshotSchema)
  await sql().transaction((tx) => [
    tx.query('delete from boards'), // cascata leva colunas e cards
    ...insertSnapshot(tx, snapshot),
  ])
  return c.body(null, 204)
})

// --- colunas -----------------------------------------------------------

app.post('/columns', async (c) => {
  const col = await body(c, columnSchema)
  await sql().transaction((tx) => [
    tx.query(INSERT_COLUMNS, [JSON.stringify([col])]),
    tx.query(TOUCH_BOARD),
  ])
  return c.body(null, 201)
})

// Rotas literais antes das com `:id`, senão "positions" casaria como id.
app.patch('/columns/positions', async (c) => {
  const { patches } = await body(c, columnPositionsSchema)
  await sql().transaction((tx) => [
    tx.query(
      `update columns col set position = (p->>'position')::float8
         from jsonb_array_elements($1::jsonb) p
        where col.id = (p->>'id')::uuid`,
      [JSON.stringify(patches)],
    ),
    tx.query(TOUCH_BOARD),
  ])
  return c.body(null, 204)
})

app.patch('/columns/:id', async (c) => {
  const id = idSchema.parse(c.req.param('id'))
  const patch = await body(c, columnPatchSchema)
  const { sets, values } = setClause(patch, {
    title: 'title',
    accent: 'accent',
    wipLimit: 'wip_limit',
    isDone: 'is_done',
    position: 'position',
  })
  const [rows] = await sql().transaction((tx) => [
    tx.query(`update columns set ${sets} where id = $${values.length + 1} returning id`, [
      ...values,
      id,
    ]),
    tx.query(TOUCH_BOARD),
  ])
  return rows.length ? c.body(null, 204) : notFound(c, 'coluna')
})

app.delete('/columns/:id', async (c) => {
  const id = idSchema.parse(c.req.param('id'))
  const [rows] = await sql().transaction((tx) => [
    tx.query('delete from columns where id = $1 returning id', [id]),
    tx.query(TOUCH_BOARD),
  ])
  return rows.length ? c.body(null, 204) : notFound(c, 'coluna')
})

// --- cards -------------------------------------------------------------

app.post('/cards', async (c) => {
  const card = await body(c, cardSchema)
  await sql().transaction((tx) => [
    tx.query(INSERT_CARDS, [JSON.stringify([card])]),
    tx.query(TOUCH_BOARD),
  ])
  return c.body(null, 201)
})

app.post('/cards/batch', async (c) => {
  const { cards } = await body(c, cardsBatchSchema)
  if (cards.length === 0) return c.body(null, 204)
  await sql().transaction((tx) => [
    tx.query(INSERT_CARDS, [JSON.stringify(cards)]),
    tx.query(TOUCH_BOARD),
  ])
  return c.body(null, 201)
})

/**
 * Move/reordena num único UPDATE. `completedAt` só é tocado quando vem no
 * patch (`p ? 'completedAt'`): mover e concluir são um ato só, mas mover
 * sem concluir não pode apagar a data.
 */
app.patch('/cards/positions', async (c) => {
  const { patches } = await body(c, cardPositionsSchema)
  await sql().transaction((tx) => [
    tx.query(
      `update cards c
          set column_id = (p->>'columnId')::uuid,
              position = (p->>'position')::float8,
              completed_at = case when p ? 'completedAt'
                                  then (p->>'completedAt')::date
                                  else c.completed_at end,
              updated_at = now()
         from jsonb_array_elements($1::jsonb) p
        where c.id = (p->>'id')::uuid`,
      [JSON.stringify(patches)],
    ),
    tx.query(TOUCH_BOARD),
  ])
  return c.body(null, 204)
})

app.patch('/cards/:id', async (c) => {
  const id = idSchema.parse(c.req.param('id'))
  const patch = await body(c, cardPatchSchema)
  const { sets, values } = setClause(patch, {
    columnId: 'column_id',
    title: 'title',
    description: 'description',
    priority: 'priority',
    dueDate: 'due_date',
    completedAt: 'completed_at',
    tags: 'tags',
    position: 'position',
  })
  const [rows] = await sql().transaction((tx) => [
    tx.query(
      `update cards set ${sets}, updated_at = now() where id = $${values.length + 1} returning id`,
      [...values, id],
    ),
    tx.query(TOUCH_BOARD),
  ])
  return rows.length ? c.body(null, 204) : notFound(c, 'card')
})

app.delete('/cards/:id', async (c) => {
  const id = idSchema.parse(c.req.param('id'))
  const [rows] = await sql().transaction((tx) => [
    tx.query('delete from cards where id = $1 returning id', [id]),
    tx.query(TOUCH_BOARD),
  ])
  return rows.length ? c.body(null, 204) : notFound(c, 'card')
})

// --- erros -------------------------------------------------------------

app.onError((err, c) => {
  if (err instanceof z.ZodError) {
    return c.json({ error: `Dados inválidos: ${err.issues.map(describeIssue).join('; ')}` }, 400)
  }
  const code = (err as { code?: string }).code
  if (code === '23505') return c.json({ error: 'Registro já existe' }, 409)
  if (code === '23503') return c.json({ error: 'Referência inexistente (coluna ou quadro)' }, 400)
  console.error(err)
  return c.json({ error: 'Erro interno no servidor' }, 500)
})

// --- helpers -----------------------------------------------------------

type Tx = NeonQueryFunctionInTransaction<false, false>

async function loadSnapshot(): Promise<BoardSnapshot | null> {
  const [board] = (await sql().query(SELECT_BOARD)) as BoardSnapshot['board'][]
  if (!board) return null
  const [columns, cards] = await sql().transaction((tx) => [
    tx.query(SELECT_COLUMNS, [board.id]),
    tx.query(SELECT_CARDS, [board.id]),
  ], { readOnly: true })
  return {
    board,
    columns: columns as BoardSnapshot['columns'],
    cards: cards as BoardSnapshot['cards'],
  }
}

function insertSnapshot(tx: Tx, s: BoardSnapshot) {
  return [
    tx.query(
      'insert into boards (id, title, created_at, updated_at) values ($1, $2, $3, $4)',
      [s.board.id, s.board.title, s.board.createdAt, s.board.updatedAt],
    ),
    tx.query(INSERT_COLUMNS, [JSON.stringify(s.columns)]),
    tx.query(INSERT_CARDS, [JSON.stringify(s.cards)]),
  ]
}

/** Lê e valida o corpo; erro de JSON ou de schema vira 400 no `onError`. */
async function body<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  const raw: unknown = await c.req.json().catch(() => {
    throw new z.ZodError([{ code: 'custom', message: 'corpo não é JSON válido', path: [], input: undefined }])
  })
  return schema.parse(raw)
}

/**
 * `SET a = $1, b = $2` a partir de um patch já validado. Só colunas da
 * whitelist entram no SQL — os nomes nunca vêm do cliente.
 */
function setClause(patch: Record<string, unknown>, columns: Record<string, string>) {
  const sets: string[] = []
  const values: unknown[] = []
  for (const [key, column] of Object.entries(columns)) {
    if (patch[key] === undefined) continue
    values.push(patch[key])
    sets.push(`${column} = $${values.length}`)
  }
  return { sets: sets.join(', '), values }
}

function notFound(c: Context, what: string) {
  return c.json({ error: `${what} não encontrado(a)` }, 404)
}

function describeIssue(issue: z.core.$ZodIssue): string {
  return issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message
}
