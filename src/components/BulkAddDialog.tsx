import { useEffect, useState } from 'react'
import { MAX_BULK_CARDS, parseBulkTitles } from '../domain/bulkTitles'
import type { Column } from '../domain/types'
import { AlertIcon } from './icons'
import { Button, Field, Modal, Textarea } from './ui'

interface Props {
  column: Column | null
  onClose: () => void
  onConfirm: (columnId: string, titles: string[]) => void
}

const PLACEHOLDER = [
  'Revisar proposta; Agendar kickoff; Atualizar roadmap',
  '',
  'ou um por linha:',
  'Revisar proposta',
  'Agendar kickoff',
].join('\n')

export function BulkAddDialog({ column, onClose, onConfirm }: Props) {
  const [text, setText] = useState('')

  // Limpa o campo a cada abertura — nada de sobra da coluna anterior.
  useEffect(() => {
    if (column) setText('')
  }, [column])

  if (!column) return null

  const { titles, dropped } = parseBulkTitles(text)

  const commit = () => {
    if (titles.length === 0) return
    onConfirm(column.id, titles)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Adicionar vários cards em "${column.title}"`}
      width="max-w-xl"
      footer={
        <>
          <span className="mr-auto text-xs text-slate-400">
            Ctrl+Enter para adicionar
          </span>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={commit} disabled={titles.length === 0}>
            Adicionar {titles.length > 0 ? titles.length : ''}{' '}
            {titles.length === 1 ? 'card' : 'cards'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field
          label="Títulos"
          hint="Separe por ponto e vírgula ( ; ) ou por quebra de linha. Espaços sobrando são removidos."
        >
          <Textarea
            autoFocus
            rows={6}
            value={text}
            placeholder={PLACEHOLDER}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                commit()
              }
            }}
          />
        </Field>

        {dropped > 0 ? (
          <p className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-300">
            <AlertIcon className="size-4 shrink-0" />
            Só os primeiros {MAX_BULK_CARDS} serão criados — {dropped}{' '}
            {dropped === 1 ? 'item ficou' : 'itens ficaram'} de fora.
          </p>
        ) : null}

        {titles.length > 0 ? (
          <div>
            <p className="mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
              Prévia · {titles.length} {titles.length === 1 ? 'card' : 'cards'}
            </p>
            <ol className="scrollbar-slim max-h-44 space-y-1 overflow-y-auto rounded-lg bg-slate-900/[0.03] p-2 dark:bg-white/5">
              {titles.map((title, i) => (
                <li
                  key={`${i}-${title}`}
                  className="flex items-start gap-2 text-sm"
                >
                  <span className="w-5 shrink-0 text-right text-xs text-slate-400 tabular-nums">
                    {i + 1}
                  </span>
                  <span className="min-w-0 break-words">{title}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <p className="text-sm text-slate-400">
            Nada para adicionar ainda — digite ou cole os títulos acima.
          </p>
        )}
      </div>
    </Modal>
  )
}
