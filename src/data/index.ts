import { readAccessKey } from './accessKey'
import { HttpBoardRepository } from './httpRepository'
import { markMigrated, seedSnapshot } from './migration'
import type { BoardRepository } from './repository'

/**
 * ÚNICO ponto de troca da persistência.
 *
 * Hoje:  API própria (server/) → Postgres/Neon. Na primeira carga com o banco
 *        vazio, o quadro do localStorage sobe sozinho (ver migration.ts).
 * Antes: new LocalStorageBoardRepository() — ainda funciona, se precisar.
 */
export const repository: BoardRepository = new HttpBoardRepository('/api', {
  accessKey: readAccessKey,
  seed: { snapshot: seedSnapshot, done: markMigrated },
})

export type { BoardRepository } from './repository'
export { HttpError } from './httpRepository'
export { clearAccessKey, saveAccessKey } from './accessKey'
