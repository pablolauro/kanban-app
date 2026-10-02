import { useState } from 'react'
import { AlertIcon } from './icons'
import { Button, Field, Input } from './ui'

/** Pede a chave de acesso da API (definida em API_TOKEN no servidor). */
export function UnlockScreen({
  rejected,
  onUnlock,
}: {
  /** true quando já havia uma chave e o servidor recusou. */
  rejected: boolean
  onUnlock: (accessKey: string) => void
}) {
  const [value, setValue] = useState('')
  return (
    <div className="grid h-full place-items-center p-4">
      <form
        className="w-full max-w-sm space-y-4 rounded-xl border border-slate-900/5 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900"
        onSubmit={(e) => {
          e.preventDefault()
          if (value.trim()) onUnlock(value)
        }}
      >
        <h1 className="text-base font-semibold">Acessar quadro</h1>
        <Field
          label="Chave de acesso"
          hint="Fica salva neste navegador. É o valor de API_TOKEN no servidor."
        >
          <Input
            type="password"
            autoFocus
            autoComplete="current-password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </Field>
        {rejected ? (
          <p className="flex items-center gap-2 text-xs font-medium text-rose-600 dark:text-rose-400">
            <AlertIcon className="size-4 shrink-0" />
            Chave recusada pelo servidor.
          </p>
        ) : null}
        <Button type="submit" variant="primary" className="w-full" disabled={!value.trim()}>
          Entrar
        </Button>
      </form>
    </div>
  )
}

/** Falha ao carregar (rede, servidor fora, banco indisponível). */
export function LoadErrorScreen({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <div className="grid h-full place-items-center p-4">
      <div className="max-w-sm space-y-3 text-center">
        <AlertIcon className="mx-auto size-6 text-amber-500" />
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Não foi possível carregar o quadro{error ? `: ${error}` : '.'}
        </p>
        <Button variant="primary" onClick={onRetry}>
          Tentar de novo
        </Button>
      </div>
    </div>
  )
}
