/**
 * Ordenação fracionária.
 *
 * Em vez de guardar índices (0,1,2...) — que obrigam a reescrever todos os
 * irmãos a cada movimento — cada item guarda um `position` numérico e um
 * movimento vira a média entre os vizinhos. Custo de mover: 1 registro.
 * Isso é o que torna o futuro `UPDATE cards SET position = $1 WHERE id = $2`
 * uma operação única no banco.
 */

const STEP = 1000

export interface Positioned {
  position: number
}

export function byPosition<T extends Positioned>(a: T, b: T): number {
  return a.position - b.position
}

export function sortByPosition<T extends Positioned>(items: T[]): T[] {
  return [...items].sort(byPosition)
}

/** Posição para inserir no fim de uma lista já ordenada. */
export function positionAtEnd(items: Positioned[]): number {
  if (items.length === 0) return STEP
  return items[items.length - 1].position + STEP
}

/**
 * Posição para inserir no índice `index` de uma lista ordenada
 * (0 = começo, items.length = fim).
 */
export function positionAt(items: Positioned[], index: number): number {
  const before = index > 0 ? items[index - 1] : undefined
  const after = index < items.length ? items[index] : undefined

  if (!before && !after) return STEP
  if (!before) return after!.position / 2
  if (!after) return before.position + STEP
  return (before.position + after.position) / 2
}

/**
 * Precisão de float acaba se um ponto é subdividido ~50 vezes seguidas.
 * Quando duas posições colidem, reespaçamos a lista (equivalente a um
 * batch UPDATE ocasional no banco).
 */
export function needsRebalance(items: Positioned[]): boolean {
  const sorted = sortByPosition(items)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].position - sorted[i - 1].position < 1e-6) return true
  }
  return false
}

export function rebalance<T extends Positioned>(items: T[]): T[] {
  return sortByPosition(items).map((item, i) => ({
    ...item,
    position: (i + 1) * STEP,
  }))
}
