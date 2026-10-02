import type { BoardSnapshot, Card, Column, Id } from '../domain/types'
import type {
  BoardRepository,
  CardPositionPatch,
  ColumnPositionPatch,
} from './repository'

/** Erro de API com o status HTTP — a store distingue 401 dos demais. */
export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
    this.name = 'HttpError'
  }
}

export interface HttpRepositoryOptions {
  /** Chave enviada como `Authorization: Bearer`. Lida a cada request. */
  accessKey: () => string | null
  /**
   * Semeia o servidor quando ele ainda não tem quadro (GET → 404). É por
   * aqui que o quadro do localStorage sobe para o banco na primeira vez.
   */
  seed?: {
    snapshot: () => BoardSnapshot
    done: () => void
  }
}

/**
 * Persistência via API (server/app.ts → Postgres/Neon).
 *
 * Nenhum componente nem a store sabe que existe rede: todos os métodos do
 * contrato já eram assíncronos. O schema SQL está em `sql/schema.sql`.
 */
export class HttpBoardRepository implements BoardRepository {
  constructor(
    private readonly baseUrl: string,
    private readonly options: HttpRepositoryOptions,
  ) {}

  async load(): Promise<BoardSnapshot> {
    const { seed } = this.options
    if (!seed) return this.request<BoardSnapshot>('GET', '/boards/current')

    try {
      return await this.request<BoardSnapshot>('GET', '/boards/current')
    } catch (err) {
      if (!(err instanceof HttpError) || err.status !== 404) throw err
    }

    const snapshot = seed.snapshot()
    try {
      // `import` só grava com o banco vazio; não sobrescreve outro navegador.
      await this.request('POST', '/boards/import', snapshot)
    } catch (err) {
      // 409: outro navegador migrou primeiro — vale o que está no servidor.
      if (err instanceof HttpError && err.status === 409) {
        return this.request<BoardSnapshot>('GET', '/boards/current')
      }
      throw err
    }
    seed.done()
    return snapshot
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
    const headers: Record<string, string> = {}
    const key = this.options.accessKey()
    if (key) headers.Authorization = `Bearer ${key}`
    if (body !== undefined) headers['Content-Type'] = 'application/json'

    let res: Response
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
    } catch {
      throw new HttpError(0, 'sem conexão com o servidor')
    }
    if (!res.ok) {
      // A API responde `{ error }` em pt-BR; sem isso, cai no status.
      const detail = await res
        .json()
        .then((j: { error?: string }) => j.error)
        .catch(() => undefined)
      throw new HttpError(res.status, detail ?? `${method} ${path} falhou (${res.status})`)
    }
    return res.status === 204 || res.status === 201
      ? (undefined as T)
      : ((await res.json()) as T)
  }
}
