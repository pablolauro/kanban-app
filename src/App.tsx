import { useEffect, useMemo, useRef, useState } from 'react'
import { BoardView } from './components/BoardView'
import { CardDialog } from './components/CardDialog'
import { Topbar } from './components/Topbar'
import { AlertIcon, FilterIcon } from './components/icons'
import { Button, Modal } from './components/ui'
import { PRIORITIES } from './domain/accents'
import {
  EMPTY_FILTER,
  isFiltering,
  togglePriority,
  type BoardFilter,
} from './domain/filters'
import { sortByPosition } from './domain/ordering'
import type { BoardSnapshot } from './domain/types'
import { useTheme } from './hooks/useTheme'
import { useBoardStore } from './store/boardStore'

export default function App() {
  const status = useBoardStore((s) => s.status)
  const error = useBoardStore((s) => s.error)
  const board = useBoardStore((s) => s.board)
  const columns = useBoardStore((s) => s.columns)
  const cards = useBoardStore((s) => s.cards)
  const init = useBoardStore((s) => s.init)
  const renameBoard = useBoardStore((s) => s.renameBoard)
  const updateCard = useBoardStore((s) => s.updateCard)
  const deleteCard = useBoardStore((s) => s.deleteCard)
  const duplicateCard = useBoardStore((s) => s.duplicateCard)
  const moveCardLocal = useBoardStore((s) => s.moveCardLocal)
  const commitCardMove = useBoardStore((s) => s.commitCardMove)
  const importSnapshot = useBoardStore((s) => s.importSnapshot)
  const resetBoard = useBoardStore((s) => s.resetBoard)

  const { theme, toggle } = useTheme()
  // Filtro é estado de sessão — não vai para o repositório nem para o
  // localStorage, de propósito (ver src/domain/filters.ts).
  const [filter, setFilter] = useState<BoardFilter>(EMPTY_FILTER)
  const [hiddenCount, setHiddenCount] = useState(0)
  const [openCardId, setOpenCardId] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void init()
  }, [init])

  const orderedColumns = useMemo(() => sortByPosition(columns), [columns])
  const openCard = openCardId ? cards.find((c) => c.id === openCardId) ?? null : null

  const exportJson = () => {
    if (!board) return
    const snapshot: BoardSnapshot = { board, columns, cards }
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${slug(board.title)}-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const importJson = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as BoardSnapshot
      if (!parsed?.board?.id || !Array.isArray(parsed.columns) || !Array.isArray(parsed.cards)) {
        throw new Error('Formato inesperado: faltam board, columns ou cards.')
      }
      await importSnapshot(parsed)
      setImportError(null)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err))
    }
  }

  if (status === 'loading' || status === 'idle') {
    return (
      <div className="grid h-full place-items-center text-sm text-slate-400">
        Carregando quadro…
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar
        title={board?.title ?? 'Quadro'}
        columnCount={columns.length}
        cardCount={cards.length}
        filter={filter}
        theme={theme}
        onQueryChange={(query) => setFilter((f) => ({ ...f, query }))}
        onTogglePriority={(priority) =>
          setFilter((f) => togglePriority(f, priority))
        }
        onRenameBoard={(title) => void renameBoard(title)}
        onToggleTheme={toggle}
        onExport={exportJson}
        onImport={() => fileInput.current?.click()}
        onReset={() => setConfirmReset(true)}
      />

      {error ? (
        <p className="flex items-center gap-2 bg-amber-500/10 px-4 py-2 text-xs font-medium text-amber-700 sm:px-6 dark:text-amber-300">
          <AlertIcon className="size-4 shrink-0" />
          Não foi possível salvar: {error} (as alterações seguem na tela, mas
          podem não persistir)
        </p>
      ) : null}

      {isFiltering(filter) ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-blue-500/10 px-4 py-2 text-xs font-medium text-blue-700 sm:px-6 dark:text-blue-300">
          <span className="flex items-center gap-1.5">
            <FilterIcon className="size-3.5 shrink-0" />
            Filtro ativo
            {filter.priorities.length > 0 ? (
              <>
                {' · '}
                {filter.priorities.map((p) => PRIORITIES[p].label).join(', ')}
              </>
            ) : null}
            {filter.query.trim() ? <>{' · '}“{filter.query.trim()}”</> : null}
          </span>
          <span className="opacity-80">
            {hiddenCount} {hiddenCount === 1 ? 'card oculto' : 'cards ocultos'}
          </span>
          <button
            type="button"
            onClick={() => setFilter(EMPTY_FILTER)}
            className="rounded-md px-1.5 py-0.5 underline underline-offset-2 hover:bg-blue-500/15"
          >
            limpar filtro
          </button>
        </div>
      ) : null}

      <main className="min-h-0 flex-1">
        <BoardView
          filter={filter}
          onOpenCard={setOpenCardId}
          onHiddenCountChange={setHiddenCount}
        />
      </main>

      <CardDialog
        card={openCard}
        columns={orderedColumns}
        onClose={() => setOpenCardId(null)}
        onSave={(id, draft) => void updateCard(id, draft)}
        onMove={(id, columnId) => {
          moveCardLocal(id, columnId, Number.MAX_SAFE_INTEGER)
          void commitCardMove(id)
        }}
        onDelete={(id) => void deleteCard(id)}
        onDuplicate={(id) => void duplicateCard(id)}
      />

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Recomeçar quadro"
        width="max-w-md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmReset(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                void resetBoard()
                setConfirmReset(false)
              }}
            >
              Recomeçar
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Isso apaga todas as colunas e cards e volta ao quadro padrão (A Fazer,
          Em Andamento, Concluído). Exporte o JSON antes se quiser um backup.
        </p>
      </Modal>

      <Modal
        open={importError !== null}
        onClose={() => setImportError(null)}
        title="Falha ao importar"
        width="max-w-md"
        footer={
          <Button variant="primary" onClick={() => setImportError(null)}>
            Entendi
          </Button>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">{importError}</p>
      </Modal>

      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void importJson(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'quadro'
  )
}
