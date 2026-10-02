import { z } from 'zod'
import type { Accent, Board, BoardSnapshot, Card, Column, Priority } from '../src/domain/types.js'

/**
 * Validação de tudo que entra pela API. Os `satisfies` amarram cada schema ao
 * tipo de domínio: se `Card`/`Column` ganhar campo, o typecheck aponta aqui.
 */

// `guid` e não `uuid`: aceita qualquer 8-4-4-4-12 hex, como o tipo `uuid` do
// Postgres — o fallback de `newId()` não garante o nibble de versão RFC.
const id = z.guid({ error: 'id deve ser um UUID' })
const title = z.string().trim().min(1, { error: 'título não pode ser vazio' }).max(500)
const isoDate = z.iso.date({ error: 'data deve estar no formato AAAA-MM-DD' }).nullable()
const timestamp = z.iso.datetime({ offset: true, error: 'data/hora deve ser ISO 8601' })
const position = z.number().finite()

const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const satisfies readonly Priority[]
const ACCENTS = [
  'slate', 'blue', 'violet', 'emerald', 'amber', 'rose', 'cyan',
] as const satisfies readonly Accent[]

export const boardSchema = z.object({
  id,
  title,
  createdAt: timestamp,
  updatedAt: timestamp,
}) satisfies z.ZodType<Board>

export const columnSchema = z.object({
  id,
  boardId: id,
  title,
  accent: z.enum(ACCENTS, { error: 'cor de coluna inválida' }),
  wipLimit: z.number().int().min(0, { error: 'limite de WIP não pode ser negativo' }),
  isDone: z.boolean(),
  position,
  createdAt: timestamp,
}) satisfies z.ZodType<Column>

export const cardSchema = z.object({
  id,
  columnId: id,
  title,
  description: z.string().max(20_000),
  priority: z.enum(PRIORITIES, { error: 'prioridade inválida' }),
  dueDate: isoDate,
  completedAt: isoDate,
  tags: z.array(z.string().trim().min(1).max(50)).max(50),
  position,
  createdAt: timestamp,
  updatedAt: timestamp,
}) satisfies z.ZodType<Card>

/** Patches: campos opcionais, mas pelo menos um. Chaves desconhecidas somem. */
export const columnPatchSchema = columnSchema
  .omit({ id: true, boardId: true, createdAt: true })
  .partial()
  .refine((p) => Object.keys(p).length > 0, { error: 'nada para atualizar' })

// `updatedAt` vem do cliente mas é ignorado: o banco carimba com now().
export const cardPatchSchema = cardSchema
  .omit({ id: true, createdAt: true, updatedAt: true })
  .partial()
  .refine((p) => Object.keys(p).length > 0, { error: 'nada para atualizar' })

export const renameBoardSchema = z.object({ title })

export const cardsBatchSchema = z.object({ cards: z.array(cardSchema).max(500) })

export const columnPositionsSchema = z.object({
  patches: z.array(z.object({ id, position })).min(1),
})

export const cardPositionsSchema = z.object({
  patches: z
    .array(
      z.object({
        id,
        columnId: id,
        position,
        // Ausente = não mexe; null = limpa. Por isso `optional` e não default.
        completedAt: isoDate.optional(),
      }),
    )
    .min(1),
})

export const snapshotSchema = z
  .object({
    board: boardSchema,
    columns: z.array(columnSchema),
    cards: z.array(cardSchema),
  })
  .superRefine((s, ctx) => {
    // Integridade referencial antes de chegar no banco, com mensagem legível.
    const columnIds = new Set(s.columns.map((c) => c.id))
    if (s.columns.some((c) => c.boardId !== s.board.id)) {
      ctx.addIssue({ code: 'custom', message: 'há colunas de outro quadro' })
    }
    if (s.cards.some((c) => !columnIds.has(c.columnId))) {
      ctx.addIssue({ code: 'custom', message: 'há cards apontando para colunas inexistentes' })
    }
  }) satisfies z.ZodType<BoardSnapshot>

export { id as idSchema }
