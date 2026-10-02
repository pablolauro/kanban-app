import { create } from 'zustand'
import { HttpError, repository, saveAccessKey } from '../data'
import { createDefaultBoard } from '../data/defaultBoard'
import { newId, nowIso, todayIso } from '../domain/ids'
import {
  needsRebalance,
  positionAt,
  positionAtEnd,
  rebalance,
  sortByPosition,
} from '../domain/ordering'
import type {
  Accent,
  Board,
  BoardSnapshot,
  Card,
  Column,
  Id,
  Priority,
} from '../domain/types'

export interface CardDraft {
  title: string
  description: string
  priority: Priority
  dueDate: string | null
  completedAt: string | null
  tags: string[]
}

/** `unauthorized`: a API recusou a chave de acesso (ou não há chave). */
type Status = 'idle' | 'loading' | 'ready' | 'error' | 'unauthorized'

interface BoardState {
  status: Status
  error: string | null
  board: Board | null
  columns: Column[]
  cards: Card[]

  init: () => Promise<void>
  /** Guarda a chave de acesso (via camada de dados) e recarrega o quadro. */
  unlock: (accessKey: string) => Promise<void>

  renameBoard: (title: string) => Promise<void>

  addColumn: (title: string, atIndex?: number) => Promise<Id>
  updateColumn: (
    id: Id,
    patch: { title?: string; accent?: Accent; wipLimit?: number; isDone?: boolean },
  ) => Promise<void>
  deleteColumn: (id: Id) => Promise<void>
  moveColumn: (id: Id, toIndex: number) => Promise<void>

  addCard: (columnId: Id, draft: CardDraft) => Promise<Id>
  /** Criação em lote a partir de títulos já limpos; devolve quantos entraram. */
  addCards: (columnId: Id, titles: string[]) => Promise<number>
  updateCard: (id: Id, draft: Partial<CardDraft>) => Promise<void>
  deleteCard: (id: Id) => Promise<void>
  duplicateCard: (id: Id) => Promise<void>

  /** Move sem persistir — usado durante o arraste (preview ao vivo). */
  moveCardLocal: (cardId: Id, toColumnId: Id, toIndex: number) => void
  /** Persiste a posição atual do card (fim do arraste). */
  commitCardMove: (cardId: Id) => Promise<void>

  importSnapshot: (snapshot: BoardSnapshot) => Promise<void>
  resetBoard: () => Promise<void>
}

export const useBoardStore = create<BoardState>((set, get) => ({
  status: 'idle',
  error: null,
  board: null,
  columns: [],
  cards: [],

  async init() {
    if (get().status === 'loading') return
    set({ status: 'loading', error: null })
    try {
      const snapshot = await repository.load()
      set({
        status: 'ready',
        board: snapshot.board,
        columns: sortByPosition(snapshot.columns),
        cards: sortByPosition(snapshot.cards),
      })
    } catch (err) {
      const unauthorized = err instanceof HttpError && err.status === 401
      set({ status: unauthorized ? 'unauthorized' : 'error', error: messageOf(err) })
    }
  },

  async unlock(accessKey) {
    saveAccessKey(accessKey)
    await get().init()
  },

  async renameBoard(title) {
    const board = get().board
    if (!board) return
    const clean = title.trim() || board.title
    set({ board: { ...board, title: clean, updatedAt: nowIso() } })
    await guard(set, () => repository.renameBoard(clean))
  },

  async addColumn(title, atIndex) {
    const { board, columns } = get()
    if (!board) throw new Error('Board não carregado')
    const ordered = sortByPosition(columns)
    const column: Column = {
      id: newId(),
      boardId: board.id,
      title: title.trim() || 'Nova coluna',
      accent: nextAccent(ordered.length),
      wipLimit: 0,
      isDone: false,
      position:
        atIndex === undefined
          ? positionAtEnd(ordered)
          : positionAt(ordered, clamp(atIndex, 0, ordered.length)),
      createdAt: nowIso(),
    }
    set({ columns: sortByPosition([...columns, column]) })
    await guard(set, () => repository.createColumn(column))
    return column.id
  },

  async updateColumn(id, patch) {
    const clean = { ...patch }
    if (clean.title !== undefined) {
      const trimmed = clean.title.trim()
      if (trimmed) clean.title = trimmed
      else delete clean.title
    }
    if (Object.keys(clean).length === 0) return
    set((s) => ({
      columns: s.columns.map((c) => (c.id === id ? { ...c, ...clean } : c)),
    }))
    await guard(set, () => repository.updateColumn(id, clean))
  },

  async deleteColumn(id) {
    set((s) => ({
      columns: s.columns.filter((c) => c.id !== id),
      cards: s.cards.filter((c) => c.columnId !== id),
    }))
    await guard(set, () => repository.deleteColumn(id))
  },

  async moveColumn(id, toIndex) {
    const ordered = sortByPosition(get().columns)
    const from = ordered.findIndex((c) => c.id === id)
    if (from === -1) return
    const target = clamp(toIndex, 0, ordered.length - 1)
    if (from === target) return

    const without = ordered.filter((c) => c.id !== id)
    const position = positionAt(without, target)
    let next = get().columns.map((c) => (c.id === id ? { ...c, position } : c))

    let patches = [{ id, position }]
    if (needsRebalance(next)) {
      next = rebalance(next)
      patches = next.map((c) => ({ id: c.id, position: c.position }))
    }
    set({ columns: sortByPosition(next) })
    await guard(set, () => repository.reorderColumns(patches))
  },

  async addCard(columnId, draft) {
    const siblings = cardsOf(get().cards, columnId)
    const now = nowIso()
    const card: Card = {
      id: newId(),
      columnId,
      title: draft.title.trim() || 'Sem título',
      description: draft.description.trim(),
      priority: draft.priority,
      dueDate: draft.dueDate,
      // Card criado direto numa coluna de conclusão já nasce concluído.
      completedAt:
        draft.completedAt ??
        (isDoneColumn(get().columns, columnId) ? todayIso() : null),
      tags: draft.tags,
      position: positionAtEnd(siblings),
      createdAt: now,
      updatedAt: now,
    }
    set((s) => ({ cards: [...s.cards, card] }))
    await guard(set, () => repository.createCard(card))
    return card.id
  },

  async addCards(columnId, titles) {
    if (titles.length === 0) return 0
    const now = nowIso()
    const completedAt = isDoneColumn(get().columns, columnId) ? todayIso() : null

    // Vai empilhando: cada card entra depois do anterior, então a ordem
    // digitada é a ordem que aparece na coluna.
    let siblings = cardsOf(get().cards, columnId)
    const created: Card[] = []
    for (const title of titles) {
      const card: Card = {
        id: newId(),
        columnId,
        title,
        description: '',
        priority: 'medium',
        dueDate: null,
        completedAt,
        tags: [],
        position: positionAtEnd(siblings),
        createdAt: now,
        updatedAt: now,
      }
      created.push(card)
      siblings = [...siblings, card]
    }

    set((s) => ({ cards: [...s.cards, ...created] }))
    await guard(set, () => repository.createCards(created))
    return created.length
  },

  async updateCard(id, draft) {
    const patch: Partial<Card> = { ...draft, updatedAt: nowIso() }
    if (patch.title !== undefined) patch.title = patch.title.trim() || 'Sem título'
    set((s) => ({ cards: s.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)) }))
    await guard(set, () => repository.updateCard(id, patch))
  },

  async deleteCard(id) {
    set((s) => ({ cards: s.cards.filter((c) => c.id !== id) }))
    await guard(set, () => repository.deleteCard(id))
  },

  async duplicateCard(id) {
    const source = get().cards.find((c) => c.id === id)
    if (!source) return
    const siblings = cardsOf(get().cards, source.columnId)
    const index = siblings.findIndex((c) => c.id === id)
    const now = nowIso()
    const copy: Card = {
      ...source,
      id: newId(),
      title: source.title + ' (cópia)',
      position: positionAt(siblings, index + 1),
      createdAt: now,
      updatedAt: now,
    }
    set((s) => ({ cards: [...s.cards, copy] }))
    await guard(set, () => repository.createCard(copy))
  },

  moveCardLocal(cardId, toColumnId, toIndex) {
    const { cards } = get()
    const card = cards.find((c) => c.id === cardId)
    if (!card) return
    const target = cardsOf(cards, toColumnId).filter((c) => c.id !== cardId)
    const position = positionAt(target, clamp(toIndex, 0, target.length))
    if (card.columnId === toColumnId && card.position === position) return
    set({
      cards: cards.map((c) =>
        c.id === cardId ? { ...c, columnId: toColumnId, position } : c,
      ),
    })
  },

  async commitCardMove(cardId) {
    const card = get().cards.find((c) => c.id === cardId)
    if (!card) return

    /**
     * Carimbo de conclusão. Fica aqui, no commit, e não no moveCardLocal:
     * durante o arraste o card pode passear por várias colunas em preview,
     * e só a coluna onde ele é solto conta.
     *
     * Duas regras do pedido, lado a lado:
     *  - só preenche se estiver VAZIO (data informada antes é preservada);
     *  - não limpa ao sair da coluna de conclusão — apagar uma data que o
     *    usuário pode ter digitado seria destrutivo. Para remover, basta
     *    limpar o campo no diálogo do card.
     */
    const completedAt =
      card.completedAt === null && isDoneColumn(get().columns, card.columnId)
        ? todayIso()
        : card.completedAt

    if (completedAt !== card.completedAt) {
      set((s) => ({
        cards: s.cards.map((c) => (c.id === cardId ? { ...c, completedAt } : c)),
      }))
    }

    let patches = [
      {
        id: card.id,
        columnId: card.columnId,
        position: card.position,
        completedAt,
      },
    ]
    const siblings = cardsOf(get().cards, card.columnId)
    if (needsRebalance(siblings)) {
      const balanced = rebalance(siblings)
      const byId = new Map(balanced.map((c) => [c.id, c.position]))
      set((s) => ({
        cards: s.cards.map((c) =>
          byId.has(c.id) ? { ...c, position: byId.get(c.id)! } : c,
        ),
      }))
      // `siblings` já foi lido depois do carimbo acima, então `completedAt`
      // aqui é o valor final — o rebalanceamento não perde a data.
      patches = balanced.map((c) => ({
        id: c.id,
        columnId: c.columnId,
        position: byId.get(c.id)!,
        completedAt: c.completedAt,
      }))
    }
    await guard(set, () => repository.moveCards(patches))
  },

  async importSnapshot(snapshot) {
    set({
      board: snapshot.board,
      columns: sortByPosition(snapshot.columns),
      cards: sortByPosition(snapshot.cards),
      status: 'ready',
    })
    await guard(set, () => repository.replaceAll(snapshot))
  },

  async resetBoard() {
    await get().importSnapshot(createDefaultBoard())
  },
}))

// --- helpers -----------------------------------------------------------

function cardsOf(cards: Card[], columnId: Id): Card[] {
  return sortByPosition(cards.filter((c) => c.columnId === columnId))
}

function isDoneColumn(columns: Column[], columnId: Id): boolean {
  return columns.find((c) => c.id === columnId)?.isDone ?? false
}

const ACCENT_CYCLE: Accent[] = [
  'slate',
  'blue',
  'emerald',
  'violet',
  'amber',
  'cyan',
  'rose',
]

function nextAccent(index: number): Accent {
  return ACCENT_CYCLE[index % ACCENT_CYCLE.length]
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * Escritas são otimistas: o estado muda na hora e a persistência acontece
 * depois. Se a persistência falhar (rede, chave recusada, validação da
 * API), registramos o erro para a UI avisar.
 */
async function guard(
  set: (partial: Partial<BoardState>) => void,
  run: () => Promise<void>,
): Promise<void> {
  try {
    await run()
    set({ error: null })
  } catch (err) {
    set({ error: messageOf(err) })
  }
}
