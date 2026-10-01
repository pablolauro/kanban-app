import { useDroppable } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEffect, useRef, useState } from 'react'
import { ACCENT_KEYS, ACCENTS } from '../domain/accents'
import type { Accent, Card, Column } from '../domain/types'
import { CardView } from './CardView'
import {
  AlertIcon,
  CheckCircleIcon,
  DotsIcon,
  GripIcon,
  ListPlusIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from './icons'
import { cn, IconButton, Input, Menu, MenuItem, MenuLabel, MenuSeparator } from './ui'

interface Props {
  column: Column
  cards: Card[]
  /** Total real na coluna (ignora o filtro) — usado no WIP. */
  totalCards: number
  /** Há filtro ativo? Muda o contador para "visíveis de total". */
  filtering: boolean
  onOpenCard: (id: string) => void
  onAddCard: (columnId: string, title: string) => void
  onBulkAdd: (column: Column) => void
  onRename: (columnId: string, title: string) => void
  onAccent: (columnId: string, accent: Accent) => void
  onWipLimit: (columnId: string, limit: number) => void
  onToggleDone: (columnId: string, isDone: boolean) => void
  onDelete: (column: Column) => void
}

export function ColumnView({
  column,
  cards,
  totalCards,
  filtering,
  onOpenCard,
  onAddCard,
  onBulkAdd,
  onRename,
  onAccent,
  onWipLimit,
  onToggleDone,
  onDelete,
}: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: column.id,
    data: { type: 'column', columnId: column.id },
  })

  // Área de drop própria: garante que uma coluna vazia aceite cards.
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop:${column.id}`,
    data: { type: 'columnDrop', columnId: column.id },
  })

  const [composing, setComposing] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)

  const accent = ACCENTS[column.accent]
  const overWip = column.wipLimit > 0 && totalCards > column.wipLimit

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'flex h-full w-[300px] shrink-0 flex-col rounded-2xl',
        'bg-slate-200/60 ring-1 ring-slate-900/5 dark:bg-slate-900/60 dark:ring-white/5',
        isDragging && 'opacity-40',
        isOver && 'ring-2 ring-blue-500/60',
      )}
      aria-label={`Coluna ${column.title}`}
    >
      {/* Cabeçalho = alça de arraste da coluna */}
      <header
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className={cn(
          'group flex cursor-grab items-center gap-2 px-3 pt-3 pb-2',
          isDragging && 'cursor-grabbing',
        )}
      >
        <span className={cn('h-5 w-1 shrink-0 rounded-full', accent.bar)} />

        {editingTitle ? (
          <TitleEditor
            initial={column.title}
            onCommit={(value) => {
              onRename(column.id, value)
              setEditingTitle(false)
            }}
            onCancel={() => setEditingTitle(false)}
          />
        ) : (
          <h2
            className="min-w-0 flex-1 truncate text-sm font-semibold"
            onDoubleClick={() => setEditingTitle(true)}
            title={`${column.title} — duplo clique para renomear`}
          >
            {column.title}
          </h2>
        )}

        <span
          className={cn(
            'rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
            overWip
              ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
              : 'bg-slate-900/5 text-slate-500 dark:bg-white/10 dark:text-slate-400',
          )}
          title={column.wipLimit > 0 ? `Limite de WIP: ${column.wipLimit}` : undefined}
        >
          {filtering && cards.length !== totalCards
            ? `${cards.length} de ${totalCards}`
            : column.wipLimit > 0
              ? `${totalCards}/${column.wipLimit}`
              : totalCards}
        </span>

        {column.isDone ? (
          <span
            className="shrink-0 text-emerald-600 dark:text-emerald-400"
            title="Coluna de conclusão — carimba a data nos cards"
            aria-label="Coluna de conclusão"
          >
            <CheckCircleIcon className="size-4" />
          </span>
        ) : null}

        <GripIcon className="size-4 shrink-0 text-slate-400 opacity-0 transition group-hover:opacity-100" />

        <div onPointerDown={(e) => e.stopPropagation()}>
          <Menu
            trigger={({ toggle }) => (
              <IconButton label="Opções da coluna" onClick={toggle}>
                <DotsIcon className="size-4" />
              </IconButton>
            )}
          >
            {(close) => (
              <>
                <MenuItem
                  icon={<PencilIcon className="size-4" />}
                  onClick={() => {
                    setEditingTitle(true)
                    close()
                  }}
                >
                  Renomear coluna
                </MenuItem>
                <MenuItem
                  icon={<PlusIcon className="size-4" />}
                  onClick={() => {
                    setComposing(true)
                    close()
                  }}
                >
                  Adicionar card
                </MenuItem>
                <MenuItem
                  icon={<ListPlusIcon className="size-4" />}
                  onClick={() => {
                    close()
                    onBulkAdd(column)
                  }}
                >
                  Adicionar vários cards…
                </MenuItem>

                <MenuItem
                  icon={<CheckCircleIcon className="size-4" />}
                  onClick={() => {
                    onToggleDone(column.id, !column.isDone)
                    close()
                  }}
                >
                  {column.isDone
                    ? 'Não é coluna de conclusão'
                    : 'Marcar como coluna de conclusão'}
                </MenuItem>

                <MenuSeparator />
                <MenuLabel>Cor</MenuLabel>
                <div className="flex flex-wrap gap-1.5 px-2.5 pb-2">
                  {ACCENT_KEYS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      title={ACCENTS[key].label}
                      aria-label={ACCENTS[key].label}
                      onClick={() => onAccent(column.id, key)}
                      className={cn(
                        'size-5 rounded-full transition',
                        ACCENTS[key].dot,
                        column.accent === key
                          ? 'ring-2 ring-slate-900 ring-offset-2 ring-offset-white dark:ring-white dark:ring-offset-slate-900'
                          : 'hover:scale-110',
                      )}
                    />
                  ))}
                </div>

                <MenuSeparator />
                <MenuLabel>Limite de WIP (0 = sem limite)</MenuLabel>
                <div className="px-2.5 pb-2">
                  <Input
                    type="number"
                    min={0}
                    max={99}
                    defaultValue={column.wipLimit}
                    onChange={(e) =>
                      onWipLimit(column.id, Math.max(0, Number(e.target.value) || 0))
                    }
                  />
                </div>

                <MenuSeparator />
                <MenuItem
                  danger
                  icon={<TrashIcon className="size-4" />}
                  onClick={() => {
                    close()
                    onDelete(column)
                  }}
                >
                  Excluir coluna
                </MenuItem>
              </>
            )}
          </Menu>
        </div>
      </header>

      {overWip ? (
        <p className="mx-3 mb-2 flex items-center gap-1.5 rounded-lg bg-rose-500/10 px-2 py-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
          <AlertIcon className="size-3.5" />
          Limite de WIP excedido
        </p>
      ) : null}

      {/* Lista de cards */}
      <div
        ref={setDropRef}
        className="scrollbar-slim min-h-[60px] flex-1 overflow-y-auto px-2 pb-1"
      >
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-2">
            {cards.map((card) => (
              <CardView key={card.id} card={card} onOpen={onOpenCard} />
            ))}
          </ul>
        </SortableContext>

        {cards.length === 0 ? (
          <p className="mt-2 rounded-xl border border-dashed border-slate-400/40 px-3 py-6 text-center text-xs text-slate-400">
            {filtering && totalCards > 0
              ? `Nenhum card corresponde ao filtro (${totalCards} ${
                  totalCards === 1 ? 'oculto' : 'ocultos'
                })`
              : 'Arraste cards para cá'}
          </p>
        ) : null}
      </div>

      {/* Composer */}
      <div className="p-2 pt-1">
        {composing ? (
          <CardComposer
            onSubmit={(title) => onAddCard(column.id, title)}
            onClose={() => setComposing(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-900/5 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-200"
          >
            <PlusIcon className="size-4" />
            Adicionar card
          </button>
        )}
      </div>
    </section>
  )
}

function TitleEditor({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string
  onCommit: (value: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ref.current?.select()
  }, [])

  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={() => onCommit(value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit(value)
        if (e.key === 'Escape') onCancel()
      }}
      className="min-w-0 flex-1 rounded-md bg-white px-1.5 py-0.5 text-sm font-semibold ring-2 ring-blue-500 outline-none dark:bg-slate-800"
    />
  )
}

function CardComposer({
  onSubmit,
  onClose,
}: {
  onSubmit: (title: string) => void
  onClose: () => void
}) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    ref.current?.focus()
  }, [])

  const commit = () => {
    const title = value.trim()
    if (!title) {
      onClose()
      return
    }
    onSubmit(title)
    setValue('')
    ref.current?.focus()
  }

  return (
    <div className="surface rounded-xl p-2 shadow-sm">
      <textarea
        ref={ref}
        rows={2}
        value={value}
        placeholder="Título do card…"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            commit()
          }
          if (e.key === 'Escape') onClose()
        }}
        className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-slate-400"
      />
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-400">Enter para salvar</span>
        <div className="flex gap-1">
          <IconButton label="Cancelar" onClick={onClose}>
            <span className="text-sm">✕</span>
          </IconButton>
          <IconButton label="Adicionar" variant="primary" onClick={commit}>
            <PlusIcon className="size-4" />
          </IconButton>
        </div>
      </div>
    </div>
  )
}
