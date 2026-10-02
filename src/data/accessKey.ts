/**
 * Chave de acesso da API (usuário único, sem login).
 *
 * Mora na camada de dados porque é a única que toca em storage — store e
 * componentes chamam estas funções, nunca o localStorage.
 */
const KEY = 'kanban.apiToken'

export function readAccessKey(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function saveAccessKey(value: string): void {
  try {
    localStorage.setItem(KEY, value.trim())
  } catch {
    // Modo privado sem storage: a chave vale só até recarregar.
  }
}

export function clearAccessKey(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // idem
  }
}
