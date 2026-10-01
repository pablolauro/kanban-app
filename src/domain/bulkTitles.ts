/**
 * Entrada rápida de vários cards: transforma um texto solto em títulos.
 *
 * Separadores: `;` (o pedido) e também quebra de linha, porque colar uma
 * lista pronta é o caso mais comum e ninguém escreve título em várias linhas
 * num campo de entrada rápida.
 */

/** Teto de segurança para um colar acidental de arquivo inteiro. */
export const MAX_BULK_CARDS = 200

export interface ParsedTitles {
  titles: string[]
  /** Quantos passaram do teto e foram descartados (0 no caso normal). */
  dropped: number
}

export function parseBulkTitles(input: string): ParsedTitles {
  const all = input
    .split(/[;\n]/)
    .map((part) => part.trim().replace(/\s+/g, ' '))
    .filter((part) => part.length > 0)

  return {
    titles: all.slice(0, MAX_BULK_CARDS),
    dropped: Math.max(0, all.length - MAX_BULK_CARDS),
  }
}
