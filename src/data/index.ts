import { LocalStorageBoardRepository } from './localStorageRepository'
import type { BoardRepository } from './repository'

/**
 * ÚNICO ponto de troca da persistência.
 *
 * Hoje:   localStorage
 * Amanhã: export const repository = new HttpBoardRepository('/api')
 */
export const repository: BoardRepository = new LocalStorageBoardRepository()

export type { BoardRepository } from './repository'
