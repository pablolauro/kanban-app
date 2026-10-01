import type { Card, Priority } from './types'

/**
 * Filtro de visualização do quadro.
 *
 * É estado de sessão, de propósito: não entra no snapshot nem no
 * localStorage. Abrir o app amanhã e ver metade dos cards sumidos por causa
 * de um filtro esquecido é pior do que reaplicá-lo.
 */
export interface BoardFilter {
  query: string
  /** Vazio = todas as prioridades. */
  priorities: Priority[]
}

export const EMPTY_FILTER: BoardFilter = { query: '', priorities: [] }

export function isFiltering(filter: BoardFilter): boolean {
  return filter.query.trim().length > 0 || filter.priorities.length > 0
}

export function matchesFilter(card: Card, filter: BoardFilter): boolean {
  if (filter.priorities.length > 0 && !filter.priorities.includes(card.priority)) {
    return false
  }

  const query = filter.query.trim().toLowerCase()
  if (!query) return true

  return (
    card.title.toLowerCase().includes(query) ||
    card.description.toLowerCase().includes(query) ||
    card.tags.some((tag) => tag.toLowerCase().includes(query))
  )
}

export function togglePriority(
  filter: BoardFilter,
  priority: Priority,
): BoardFilter {
  const active = filter.priorities.includes(priority)
  return {
    ...filter,
    priorities: active
      ? filter.priorities.filter((p) => p !== priority)
      : [...filter.priorities, priority],
  }
}
