import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type Over,
} from '@dnd-kit/core'
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ACCENTS } from '../domain/accents'
import { isFiltering, matchesFilter, type BoardFilter } from '../domain/filters'
import { sortByPosition } from '../domain/ordering'
import type { Card, Column, Id } from '../domain/types'
import { useBoardStore } from '../store/boardStore'
import { BulkAddDialog } from './BulkAddDialog'
import { CardPreview } from './CardView'
import { ColumnView } from './ColumnView'
import { PlusIcon } from './icons'
import { Button, Input, Modal, cn } from './ui'

interface Props {
  filter: BoardFilter
  onOpenCard: (id: Id) => void
  /** Quantos cards o filtro está escondendo — a barra de aviso usa isso. */
  onHiddenCountChange: (hidden: number) => void
}

type ActiveDrag =
  | { type: 'card'; card: Card }
  | { type: 'column'; column: Column }
  | null

export function BoardView({ filter, onOpenCard, onHiddenCountChange }: Props) {
  const columns = useBoardStore((s) => s.columns)
  const cards = useBoardStore((s) => s.cards)
  const addColumn = useBoardStore((s) => s.addColumn)
  const updateColumn = useBoardStore((s) => s.updateColumn)
  const deleteColumn = useBoardStore((s) => s.deleteColumn)
  const moveColumn = useBoardStore((s) => s.moveColumn)
  const addCard = useBoardStore((s) => s.addCard)
  const addCards = useBoardStore((s) => s.addCards)
  const moveCardLocal = useBoardStore((s) => s.moveCardLocal)
  const commitCardMove = useBoardStore((s) => s.commitCardMove)

  const [active, setActive] = useState<ActiveDrag>(null)
  const [pendingDelete, setPendingDelete] = useState<Column | null>(null)
  const [bulkTarget, setBulkTarget] = useState<Column | null>(null)
  const scroller = useRef<HTMLDivElement>(null)

  const orderedColumns = useMemo(() => sortByPosition(columns), [columns])

  /** Todos os cards por coluna, em ordem — base para calcular índices. */
  const byColumn = useMemo(() => {
    const map = new Map<Id, Card[]>()
    for (const column of orderedColumns) map.set(column.id, [])
    for (const card of cards) map.get(card.columnId)?.push(card)
    for (const [, list] of map) list.sort((a, b) => a.position - b.position)
    return map
  }, [orderedColumns, cards])

  const filtering = isFiltering(filter)

  /** O que aparece na tela (o filtro não altera o estado persistido). */
  const visibleByColumn = useMemo(() => {
    if (!filtering) return byColumn
    const map = new Map<Id, Card[]>()
    for (const [columnId, list] of byColumn) {
      map.set(
        columnId,
        list.filter((card) => matchesFilter(card, filter)),
      )
    }
    return map
  }, [byColumn, filtering, filter])

  const hiddenCount = useMemo(() => {
    if (!filtering) return 0
    let visible = 0
    for (const [, list] of visibleByColumn) visible += list.length
    return cards.length - visible
  }, [filtering, visibleByColumn, cards.length])

  useEffect(() => {
    onHiddenCountChange(hiddenCount)
  }, [hiddenCount, onHiddenCountChange])

  const sensors = useSensors(
    // 6px de tolerância: clicar no card abre o editor, arrastar move.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  useEffect(() => {
    document.body.classList.toggle('is-dragging', active !== null)
  }, [active])

  const columnIdOf = (over: Over | null): Id | null => {
    if (!over) return null
    const data = over.data.current as { type?: string; columnId?: Id } | undefined
    if (data?.columnId) return data.columnId
    return byColumn.has(over.id as Id) ? (over.id as Id) : null
  }

  const onDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as { type?: string } | undefined
    if (data?.type === 'column') {
      const column = orderedColumns.find((c) => c.id === event.active.id)
      setActive(column ? { type: 'column', column } : null)
      return
    }
    const card = cards.find((c) => c.id === event.active.id)
    setActive(card ? { type: 'card', card } : null)
  }

  /** Movimento entre colunas acontece já durante o arraste (preview). */
  const onDragOver = (event: DragOverEvent) => {
    const { active: dragged, over } = event
    if ((dragged.data.current as { type?: string } | undefined)?.type !== 'card') return

    const targetColumnId = columnIdOf(over)
    if (!targetColumnId) return

    const card = cards.find((c) => c.id === dragged.id)
    if (!card || card.columnId === targetColumnId) return

    moveCardLocal(dragged.id as Id, targetColumnId, insertIndex(event, targetColumnId))
  }

  const onDragEnd = (event: DragEndEvent) => {
    const { active: dragged, over } = event
    setActive(null)

    const type = (dragged.data.current as { type?: string } | undefined)?.type

    if (type === 'column') {
      const targetColumnId = columnIdOf(over)
      if (!targetColumnId || targetColumnId === dragged.id) return
      const toIndex = orderedColumns.findIndex((c) => c.id === targetColumnId)
      if (toIndex !== -1) void moveColumn(dragged.id as Id, toIndex)
      return
    }

    const cardId = dragged.id as Id
    const card = cards.find((c) => c.id === cardId)
    if (!card) return

    const targetColumnId = columnIdOf(over) ?? card.columnId
    moveCardLocal(cardId, targetColumnId, insertIndex(event, targetColumnId))
    void commitCardMove(cardId)
  }

  /**
   * Índice de inserção dentro da coluna destino.
   * Sobre um card: antes ou depois dele, conforme o lado em que o ponteiro
   * cruzou a metade. Sobre a área vazia da coluna: no fim.
   */
  const insertIndex = (event: DragOverEvent | DragEndEvent, targetColumnId: Id): number => {
    const { active: dragged, over } = event
    const list = byColumn.get(targetColumnId) ?? []
    const overType = (over?.data.current as { type?: string } | undefined)?.type
    if (!over || overType !== 'card') return list.length

    const index = list.findIndex((c) => c.id === over.id)
    if (index === -1) return list.length

    const sameColumn = list.some((c) => c.id === dragged.id)
    const draggedTop = dragged.rect.current.translated?.top
    const overCenter = over.rect.top + over.rect.height / 2
    const after = draggedTop !== undefined && draggedTop > overCenter

    if (sameColumn) return index
    return after ? index + 1 : index
  }

  return (
    <>
      <div
        ref={scroller}
        className="scrollbar-slim flex h-full gap-4 overflow-x-auto overflow-y-hidden px-4 pt-4 pb-5 sm:px-6"
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActive(null)}
        >
          <SortableContext
            items={orderedColumns.map((c) => c.id)}
            strategy={horizontalListSortingStrategy}
          >
            {orderedColumns.map((column) => (
              <ColumnView
                key={column.id}
                column={column}
                cards={visibleByColumn.get(column.id) ?? []}
                totalCards={(byColumn.get(column.id) ?? []).length}
                filtering={filtering}
                onOpenCard={onOpenCard}
                onAddCard={(columnId, title) =>
                  void addCard(columnId, {
                    title,
                    description: '',
                    priority: 'medium',
                    dueDate: null,
                    completedAt: null,
                    tags: [],
                  })
                }
                onBulkAdd={setBulkTarget}
                onRename={(columnId, title) => void updateColumn(columnId, { title })}
                onAccent={(columnId, accent) => void updateColumn(columnId, { accent })}
                onWipLimit={(columnId, wipLimit) =>
                  void updateColumn(columnId, { wipLimit })
                }
                onToggleDone={(columnId, isDone) =>
                  void updateColumn(columnId, { isDone })
                }
                onDelete={setPendingDelete}
              />
            ))}
          </SortableContext>

          <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(.2,.8,.3,1)' }}>
            {active?.type === 'card' ? (
              <div className="w-[284px]">
                <CardPreview card={active.card} />
              </div>
            ) : active?.type === 'column' ? (
              <ColumnGhost column={active.column} count={(byColumn.get(active.column.id) ?? []).length} />
            ) : null}
          </DragOverlay>
        </DndContext>

        <AddColumn
          onAdd={async (title) => {
            await addColumn(title)
            // Rola até a coluna recém-criada.
            requestAnimationFrame(() => {
              scroller.current?.scrollTo({
                left: scroller.current.scrollWidth,
                behavior: 'smooth',
              })
            })
          }}
        />
      </div>

      <BulkAddDialog
        column={bulkTarget}
        onClose={() => setBulkTarget(null)}
        onConfirm={(columnId, titles) => void addCards(columnId, titles)}
      />

      <DeleteColumnDialog
        column={pendingDelete}
        cardCount={pendingDelete ? (byColumn.get(pendingDelete.id) ?? []).length : 0}
        onClose={() => setPendingDelete(null)}
        onConfirm={(id) => {
          void deleteColumn(id)
          setPendingDelete(null)
        }}
      />
    </>
  )
}

function ColumnGhost({ column, count }: { column: Column; count: number }) {
  return (
    <div className="w-[300px] rotate-1 rounded-2xl bg-slate-200/90 p-3 shadow-2xl ring-1 ring-slate-900/10 dark:bg-slate-900/95 dark:ring-white/10">
      <div className="flex items-center gap-2">
        <span className={cn('h-5 w-1 rounded-full', ACCENTS[column.accent].bar)} />
        <span className="flex-1 truncate text-sm font-semibold">{column.title}</span>
        <span className="rounded-md bg-slate-900/5 px-1.5 py-0.5 text-[11px] font-semibold dark:bg-white/10">
          {count}
        </span>
      </div>
    </div>
  )
}

function AddColumn({ onAdd }: { onAdd: (title: string) => void | Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 w-[300px] shrink-0 items-center gap-2 rounded-2xl border border-dashed border-slate-400/50 px-3 text-sm font-medium text-slate-500 transition-colors hover:border-slate-500 hover:bg-white/60 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-200"
      >
        <PlusIcon className="size-4" />
        Adicionar coluna
      </button>
    )
  }

  const commit = () => {
    const title = value.trim()
    if (title) void onAdd(title)
    setValue('')
    setOpen(false)
  }

  return (
    <div className="surface h-fit w-[300px] shrink-0 rounded-2xl p-2 shadow-sm">
      <Input
        autoFocus
        value={value}
        placeholder="Nome da coluna…"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setOpen(false)
        }}
      />
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="primary" onClick={commit}>
          Adicionar
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}

function DeleteColumnDialog({
  column,
  cardCount,
  onClose,
  onConfirm,
}: {
  column: Column | null
  cardCount: number
  onClose: () => void
  onConfirm: (id: Id) => void
}) {
  if (!column) return null
  return (
    <Modal
      open
      onClose={onClose}
      title="Excluir coluna"
      width="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={() => onConfirm(column.id)}>
            Excluir
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-600 dark:text-slate-300">
        A coluna <strong>{column.title}</strong>
        {cardCount > 0 ? (
          <>
            {' '}
            e seus <strong>{cardCount}</strong>{' '}
            {cardCount === 1 ? 'card' : 'cards'} serão removidos.
          </>
        ) : (
          ' será removida.'
        )}{' '}
        Esta ação não pode ser desfeita.
      </p>
    </Modal>
  )
}
