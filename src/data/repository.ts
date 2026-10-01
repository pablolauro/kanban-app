import type { BoardSnapshot, Card, Column, Id } from '../domain/types'

/** Patch parcial de posição — usado em movimentações e rebalanceamento. */
export interface CardPositionPatch {
  id: Id
  columnId: Id
  position: number
  /**
   * Vem junto quando a própria movimentação carimba a conclusão do card.
   * Fica no mesmo patch de propósito: mover e concluir são um ato só, então
   * no banco isso é um único UPDATE — não dá para o card acabar movido mas
   * sem data por falha na segunda chamada.
   */
  completedAt?: string | null
}

export interface ColumnPositionPatch {
  id: Id
  position: number
}

/**
 * Contrato único de persistência.
 *
 * TODA escrita do app passa por aqui — a store nunca toca em localStorage nem
 * em `fetch` diretamente. Trocar para Postgres/Neon no futuro é implementar
 * esta mesma interface (ver `httpRepository.ts`) e mudar uma linha em
 * `src/data/index.ts`.
 *
 * Os métodos são assíncronos de propósito, mesmo que o localStorage seja
 * síncrono: a UI já convive com latência hoje, então a troca por rede não
 * muda nenhum componente.
 */
export interface BoardRepository {
  /** Carrega o board (criando o padrão na primeira execução). */
  load(): Promise<BoardSnapshot>

  renameBoard(title: string): Promise<void>

  createColumn(column: Column): Promise<void>
  updateColumn(id: Id, patch: Partial<Omit<Column, 'id' | 'boardId'>>): Promise<void>
  /** Remove a coluna e, em cascata, seus cards. */
  deleteColumn(id: Id): Promise<void>
  reorderColumns(patches: ColumnPositionPatch[]): Promise<void>

  createCard(card: Card): Promise<void>
  /**
   * Criação em lote (entrada rápida de vários cards de uma vez).
   * Existe separado de `createCard` para que no banco isso seja um único
   * INSERT com várias linhas, e não N round-trips.
   */
  createCards(cards: Card[]): Promise<void>
  updateCard(id: Id, patch: Partial<Omit<Card, 'id'>>): Promise<void>
  deleteCard(id: Id): Promise<void>
  /** Move/reordena cards (inclusive entre colunas). */
  moveCards(patches: CardPositionPatch[]): Promise<void>

  /** Substitui o board inteiro — usado por importação de JSON. */
  replaceAll(snapshot: BoardSnapshot): Promise<void>
}
