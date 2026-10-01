/**
 * Modelo de domínio.
 *
 * Desenhado para mapear 1:1 em tabelas SQL (Postgres/Neon) quando sairmos do
 * localStorage:
 *
 *   boards  (id, title, created_at, updated_at)
 *   columns (id, board_id, title, accent, wip_limit, position, created_at)
 *   cards   (id, column_id, title, description, priority, due_date,
 *            position, created_at, updated_at)
 *
 * Decisões que evitam refatoração no futuro:
 *  - `id` é UUID gerado no cliente (não autoincremento) → podemos criar
 *    entidades offline e sincronizar depois sem conflito de chave.
 *  - `position` é fracionário: mover um item é 1 UPDATE, não N.
 *  - datas em ISO 8601 string (compatível com `timestamptz`).
 */

export type Id = string

export type Priority = 'low' | 'medium' | 'high' | 'urgent'

/** Chaves de cor do acento da coluna (resolvidas em `src/domain/accents.ts`). */
export type Accent =
  | 'slate'
  | 'blue'
  | 'violet'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'cyan'

export interface Card {
  id: Id
  columnId: Id
  title: string
  description: string
  priority: Priority
  /** ISO date (YYYY-MM-DD) ou null. */
  dueDate: string | null
  /**
   * ISO date (YYYY-MM-DD) ou null. Preenchida sozinha ao mover o card para
   * uma coluna de conclusão, **apenas se ainda estiver vazia** — e sempre
   * editável à mão no diálogo do card.
   */
  completedAt: string | null
  tags: string[]
  position: number
  createdAt: string
  updatedAt: string
}

export interface Column {
  id: Id
  boardId: Id
  title: string
  accent: Accent
  /** Limite de WIP; 0 = sem limite. */
  wipLimit: number
  /**
   * Coluna de conclusão: cards que chegam aqui ganham `completedAt`.
   * É uma flag, e não o título "Concluído", porque colunas podem ser
   * renomeadas a qualquer momento sem perder o comportamento.
   */
  isDone: boolean
  position: number
  createdAt: string
}

export interface Board {
  id: Id
  title: string
  createdAt: string
  updatedAt: string
}

/** Agregado completo carregado/persistido de uma vez. */
export interface BoardSnapshot {
  board: Board
  columns: Column[]
  cards: Card[]
}
