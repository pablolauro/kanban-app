import { useEffect, useRef, useState } from 'react'
import { PRIORITIES, PRIORITY_KEYS } from '../domain/accents'
import type { BoardFilter } from '../domain/filters'
import type { Priority } from '../domain/types'
import type { Theme } from '../hooks/useTheme'
import {
  DotsIcon,
  DownloadIcon,
  LayersIcon,
  MoonIcon,
  RefreshIcon,
  SearchIcon,
  SunIcon,
  UploadIcon,
  XIcon,
} from './icons'
import { IconButton, Menu, MenuItem, MenuSeparator, cn } from './ui'

interface Props {
  title: string
  columnCount: number
  cardCount: number
  filter: BoardFilter
  theme: Theme
  onQueryChange: (value: string) => void
  onTogglePriority: (priority: Priority) => void
  onRenameBoard: (title: string) => void
  onToggleTheme: () => void
  onExport: () => void
  onImport: () => void
  onReset: () => void
}

export function Topbar({
  title,
  columnCount,
  cardCount,
  filter,
  theme,
  onQueryChange,
  onTogglePriority,
  onRenameBoard,
  onToggleTheme,
  onExport,
  onImport,
  onReset,
}: Props) {
  const search = useRef<HTMLInputElement>(null)

  // "/" foca a busca, como em ferramentas de produtividade.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable
      if (e.key === '/' && !typing) {
        e.preventDefault()
        search.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-slate-900/5 bg-white/80 px-4 py-3 backdrop-blur sm:px-6 dark:border-white/10 dark:bg-slate-900/70">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-blue-600 text-white shadow-sm">
          <LayersIcon className="size-5" />
        </span>
        <div className="min-w-0">
          <BoardTitle title={title} onRename={onRenameBoard} />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {columnCount} {columnCount === 1 ? 'coluna' : 'colunas'} ·{' '}
            {cardCount} {cardCount === 1 ? 'card' : 'cards'}
          </p>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <PriorityFilter active={filter.priorities} onToggle={onTogglePriority} />

        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" />
          <input
            ref={search}
            value={filter.query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onQueryChange('')
            }}
            placeholder="Buscar cards…  /"
            aria-label="Buscar cards"
            className={cn(
              'h-9 w-44 rounded-lg bg-slate-100 pr-8 pl-8 text-sm ring-1 ring-slate-900/10 transition-all',
              'placeholder:text-slate-400 focus:w-60 focus:ring-2 focus:ring-blue-500 focus:outline-none',
              'dark:bg-slate-800 dark:ring-white/10',
            )}
          />
          {filter.query ? (
            <button
              type="button"
              aria-label="Limpar busca"
              onClick={() => onQueryChange('')}
              className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-md text-slate-400 hover:bg-slate-900/5 dark:hover:bg-white/10"
            >
              <XIcon className="size-3.5" />
            </button>
          ) : null}
        </div>

        <IconButton
          label={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
          variant="secondary"
          onClick={onToggleTheme}
        >
          {theme === 'dark' ? (
            <SunIcon className="size-4" />
          ) : (
            <MoonIcon className="size-4" />
          )}
        </IconButton>

        <Menu
          trigger={({ toggle }) => (
            <IconButton label="Mais opções" variant="secondary" onClick={toggle}>
              <DotsIcon className="size-4" />
            </IconButton>
          )}
        >
          {(close) => (
            <>
              <MenuItem
                icon={<DownloadIcon className="size-4" />}
                onClick={() => {
                  onExport()
                  close()
                }}
              >
                Exportar JSON
              </MenuItem>
              <MenuItem
                icon={<UploadIcon className="size-4" />}
                onClick={() => {
                  onImport()
                  close()
                }}
              >
                Importar JSON
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                danger
                icon={<RefreshIcon className="size-4" />}
                onClick={() => {
                  close()
                  onReset()
                }}
              >
                Recomeçar quadro
              </MenuItem>
            </>
          )}
        </Menu>
      </div>
    </header>
  )
}

/**
 * Chips de prioridade. Multi-seleção: nenhum marcado = todas as prioridades,
 * que é o mesmo resultado de marcar as quatro — por isso não existe um
 * estado "todas" separado para o usuário administrar.
 */
function PriorityFilter({
  active,
  onToggle,
}: {
  active: Priority[]
  onToggle: (priority: Priority) => void
}) {
  return (
    <div
      className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 ring-1 ring-slate-900/10 dark:bg-slate-800 dark:ring-white/10"
      role="group"
      aria-label="Filtrar por prioridade"
    >
      {PRIORITY_KEYS.map((key) => {
        const on = active.includes(key)
        return (
          <button
            key={key}
            type="button"
            aria-pressed={on}
            title={`Prioridade ${PRIORITIES[key].label}`}
            onClick={() => onToggle(key)}
            className={cn(
              'rounded-md px-2 py-1 text-xs font-semibold transition',
              on
                ? `${PRIORITIES[key].chip} ring-1 ring-inset`
                : 'text-slate-500 hover:bg-slate-900/5 dark:text-slate-400 dark:hover:bg-white/10',
            )}
          >
            {PRIORITIES[key].label}
          </button>
        )
      })}
    </div>
  )
}

function BoardTitle({
  title,
  onRename,
}: {
  title: string
  onRename: (value: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(title)

  useEffect(() => setValue(title), [title])

  if (!editing) {
    return (
      <h1
        className="truncate text-base leading-tight font-semibold"
        title="Duplo clique para renomear o quadro"
        onDoubleClick={() => setEditing(true)}
      >
        {title}
      </h1>
    )
  }

  const commit = () => {
    onRename(value)
    setEditing(false)
  }

  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') {
          setValue(title)
          setEditing(false)
        }
      }}
      className="w-48 rounded-md bg-white px-1.5 py-0.5 text-base font-semibold ring-2 ring-blue-500 outline-none dark:bg-slate-800"
    />
  )
}
