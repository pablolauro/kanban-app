import type { BoardSnapshot, Card, Column, Id } from '../domain/types'
import type {
  BoardRepository,
  CardPositionPatch,
  ColumnPositionPatch,
} from './repository'

/**
 * Implementação FUTURA, para quando o Postgres/Neon entrar.
 *
 * Está pronta e compila, mas não é usada ainda (ver `src/data/index.ts`).
 * Quando a API existir, basta:
 *
 *   // src/data/index.ts
 *   export const repository = new HttpBoardRepository('/api')
 *
 * Nenhum componente, nem a store, precisa mudar — é por isso que todos os
 * métodos do contrato já são assíncronos.
 *
 * O schema SQL correspondente está em `sql/schema.sql`.
 */
export class HttpBoardRepository implements BoardRepository {
  constructor(private readonly baseUrl: string, private readonly boardId?: Id) {}

  load(): Promise<BoardSnapshot> {
    const path = this.boardId ? `/boards/${this.boardId}` : '/boards/current'
    return this.request<BoardSnapshot>('GET', path)
  }

  async renameBoard(title: string): Promise<void> {
    await this.request('PATCH', '/boards/current', { title })
  }

  async createColumn(column: Column): Promise<void> {
    await this.request('POST', '/columns', column)
  }

  async updateColumn(id: Id, patch: Partial<Omit<Column, 'id' | 'boardId'>>): Promise<void> {
    await this.request('PATCH', `/columns/${id}`, patch)
  }

  async deleteColumn(id: Id): Promise<void> {
    await this.request('DELETE', `/columns/${id}`)
  }

  async reorderColumns(patches: ColumnPositionPatch[]): Promise<void> {
    await this.request('PATCH', '/columns/positions', { patches })
  }

  async createCard(card: Card): Promise<void> {
    await this.request('POST', '/cards', card)
  }

  async createCards(cards: Card[]): Promise<void> {
    if (cards.length === 0) return
    await this.request('POST', '/cards/batch', { cards })
  }

  async updateCard(id: Id, patch: Partial<Omit<Card, 'id'>>): Promise<void> {
    await this.request('PATCH', `/cards/${id}`, patch)
  }

  async deleteCard(id: Id): Promise<void> {
    await this.request('DELETE', `/cards/${id}`)
  }

  async moveCards(patches: CardPositionPatch[]): Promise<void> {
    await this.request('PATCH', '/cards/positions', { patches })
  }

  async replaceAll(snapshot: BoardSnapshot): Promise<void> {
    await this.request('PUT', '/boards/current', snapshot)
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      throw new Error(`${method} ${path} falhou: ${res.status} ${res.statusText}`)
    }
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T)
  }
}
