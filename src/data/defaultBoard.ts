import { newId, nowIso, todayIso } from '../domain/ids'
import type { BoardSnapshot, Card, Column } from '../domain/types'

/**
 * Board inicial. As três colunas padrão são apenas dados — podem ser
 * renomeadas, recolorizadas, reordenadas ou removidas pela UI.
 */
export function createDefaultBoard(): BoardSnapshot {
  const now = nowIso()
  const boardId = newId()

  const defs: Array<Pick<Column, 'title' | 'accent' | 'isDone'>> = [
    { title: 'A Fazer', accent: 'slate', isDone: false },
    { title: 'Em Andamento', accent: 'blue', isDone: false },
    // isDone marca a coluna de conclusão — sobrevive a renomear a coluna.
    { title: 'Concluído', accent: 'emerald', isDone: true },
  ]

  const columns: Column[] = defs.map((def, i) => ({
    id: newId(),
    boardId,
    title: def.title,
    accent: def.accent,
    wipLimit: 0,
    isDone: def.isDone,
    position: (i + 1) * 1000,
    createdAt: now,
  }))

  const card = (
    columnId: string,
    title: string,
    description: string,
    priority: Card['priority'],
    position: number,
    tags: string[],
    completedAt: string | null = null,
  ): Card => ({
    id: newId(),
    columnId,
    title,
    description,
    priority,
    dueDate: null,
    completedAt,
    tags,
    position,
    createdAt: now,
    updatedAt: now,
  })

  const cards: Card[] = [
    card(columns[0].id, 'Arraste este card para outra coluna', 'Você pode arrastar com o mouse ou, com o card focado, apertar Espaço e usar as setas do teclado.', 'medium', 1000, ['dica']),
    card(columns[0].id, 'Clique no card para editar', 'Título, descrição, prioridade, prazo e etiquetas.', 'low', 2000, []),
    card(columns[1].id, 'Renomeie as colunas', 'Dê um duplo clique no nome da coluna — ou use o menu "⋯" para trocar a cor, definir limite de WIP ou excluir.', 'high', 1000, ['dica']),
    card(
      columns[2].id,
      'Reordene as colunas arrastando o cabeçalho',
      'A ordem que você escolher é salva automaticamente.',
      'low',
      1000,
      [],
      todayIso(),
    ),
  ]

  return {
    board: { id: boardId, title: 'Meu Quadro', createdAt: now, updatedAt: now },
    columns,
    cards,
  }
}
