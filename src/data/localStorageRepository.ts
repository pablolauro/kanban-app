import { nowIso } from '../domain/ids'
import type { BoardSnapshot, Card, Column, Id } from '../domain/types'
import { createDefaultBoard } from './defaultBoard'
import type {
  BoardRepository,
  CardPositionPatch,
  ColumnPositionPatch,
} from './repository'

const STORAGE_KEY = 'kanban.board.v1'

interface Persisted {
  version: 1
  snapshot: BoardSnapshot
}

/**
 * Implementação atual: tudo em localStorage, sob uma única chave.
 *
 * A granularidade dos métodos (um card, uma coluna) existe para o futuro
 * backend; aqui cada chamada simplesmente reescreve o JSON — simples e
 * suficiente para a escala de um quadro pessoal.
 */
export class LocalStorageBoardRepository implements BoardRepository {
  private cache: BoardSnapshot | null = null

  async load(): Promise<BoardSnapshot> {
    const raw = safeRead()
    if (raw) {
      this.cache = raw.snapshot
      return clone(raw.snapshot)
    }
    const fresh = createDefaultBoard()
    this.cache = fresh
    this.flush()
    return clone(fresh)
  }

  async renameBoard(title: string): Promise<void> {
    this.mutate((s) => {
      s.board.title = title
    })
  }

  async createColumn(column: Column): Promise<void> {
    this.mutate((s) => {
      s.columns.push(clone(column))
    })
  }

  async updateColumn(id: Id, patch: Partial<Omit<Column, 'id' | 'boardId'>>): Promise<void> {
    this.mutate((s) => {
      const target = s.columns.find((c) => c.id === id)
      if (target) Object.assign(target, patch)
    })
  }

  async deleteColumn(id: Id): Promise<void> {
    this.mutate((s) => {
      s.columns = s.columns.filter((c) => c.id !== id)
      // Cascata — o equivalente ao ON DELETE CASCADE no Postgres.
      s.cards = s.cards.filter((c) => c.columnId !== id)
    })
  }

  async reorderColumns(patches: ColumnPositionPatch[]): Promise<void> {
    this.mutate((s) => {
      for (const p of patches) {
        const target = s.columns.find((c) => c.id === p.id)
        if (target) target.position = p.position
      }
    })
  }

  async createCard(card: Card): Promise<void> {
    this.mutate((s) => {
      s.cards.push(clone(card))
    })
  }

  async createCards(cards: Card[]): Promise<void> {
    if (cards.length === 0) return
    this.mutate((s) => {
      for (const card of cards) s.cards.push(clone(card))
    })
  }

  async updateCard(id: Id, patch: Partial<Omit<Card, 'id'>>): Promise<void> {
    this.mutate((s) => {
      const target = s.cards.find((c) => c.id === id)
      if (target) Object.assign(target, patch, { updatedAt: nowIso() })
    })
  }

  async deleteCard(id: Id): Promise<void> {
    this.mutate((s) => {
      s.cards = s.cards.filter((c) => c.id !== id)
    })
  }

  async moveCards(patches: CardPositionPatch[]): Promise<void> {
    this.mutate((s) => {
      for (const p of patches) {
        const target = s.cards.find((c) => c.id === p.id)
        if (target) {
          target.columnId = p.columnId
          target.position = p.position
          if (p.completedAt !== undefined) target.completedAt = p.completedAt
          target.updatedAt = nowIso()
        }
      }
    })
  }

  async replaceAll(snapshot: BoardSnapshot): Promise<void> {
    this.cache = clone(snapshot)
    this.flush()
  }

  // ---------------------------------------------------------------

  private mutate(fn: (snapshot: BoardSnapshot) => void): void {
    if (!this.cache) throw new Error('Repositório usado antes de load()')
    fn(this.cache)
    this.cache.board.updatedAt = nowIso()
    this.flush()
  }

  private flush(): void {
    if (!this.cache) return
    const payload: Persisted = { version: 1, snapshot: this.cache }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch (err) {
      // Quota cheia / modo privado: o app segue funcionando em memória.
      console.error('Falha ao salvar no localStorage:', err)
    }
  }
}

/** Exportado também para a migração ao servidor (`migration.ts`). */
export function safeRead(): Persisted | null {
  try {
    const text = localStorage.getItem(STORAGE_KEY)
    if (!text) return null
    const parsed = JSON.parse(text) as Persisted
    if (!parsed?.snapshot?.board || !Array.isArray(parsed.snapshot.columns)) return null
    // Tolera dados gravados por versões anteriores sem campos novos.
    parsed.snapshot.cards = (parsed.snapshot.cards ?? []).map((c) => ({
      ...c,
      tags: c.tags ?? [],
      dueDate: c.dueDate ?? null,
      completedAt: c.completedAt ?? null,
      description: c.description ?? '',
    }))
    parsed.snapshot.columns = parsed.snapshot.columns.map((c) => ({
      ...c,
      wipLimit: c.wipLimit ?? 0,
      accent: c.accent ?? 'slate',
      // Quadros salvos antes da flag existir: adota a coluna cujo título
      // ainda é o padrão de conclusão. Depois disso a flag manda, e
      // renomear a coluna não muda mais nada.
      isDone: c.isDone ?? looksDone(c.title),
    }))
    return parsed
  } catch {
    return null
  }
}

/** Só para a migração de quadros antigos — não é usado em runtime normal. */
function looksDone(title: string): boolean {
  const normalized = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
  return ['concluido', 'concluidos', 'done', 'finalizado', 'feito'].includes(
    normalized,
  )
}

function clone<T>(value: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : (JSON.parse(JSON.stringify(value)) as T)
}
