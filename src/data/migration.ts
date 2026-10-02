import type { BoardSnapshot } from '../domain/types'
import { nowIso } from '../domain/ids'
import { createDefaultBoard } from './defaultBoard'
import { safeRead } from './localStorageRepository'

const MIGRATED_KEY = 'kanban.migratedAt'

/**
 * Quadro com que o servidor é semeado quando ainda está vazio: o que estiver
 * salvo no localStorage desta origem (já normalizado por `safeRead()`, que
 * aplica os defaults de campos novos) ou, sem nada salvo, o quadro padrão.
 */
export function seedSnapshot(): BoardSnapshot {
  return safeRead()?.snapshot ?? createDefaultBoard()
}

/**
 * Marca a migração como feita. O `kanban.board.v1` NÃO é apagado: fica como
 * backup local até o usuário decidir limpar o navegador.
 */
export function markMigrated(): void {
  try {
    localStorage.setItem(MIGRATED_KEY, nowIso())
  } catch {
    // Sem storage não há o que marcar — e nem o que migrar de novo.
  }
}
