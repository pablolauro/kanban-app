import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { PRIORITIES } from '../domain/accents'
import type { Card } from '../domain/types'
import { todayIso } from '../domain/ids'
import { CalendarIcon, CheckCircleIcon, PencilIcon, TextIcon } from './icons'
import { cn, IconButton } from './ui'

interface Props {
  card: Card
  onOpen: (id: string) => void
}

export function CardView({ card, onOpen }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: card.id,
    data: { type: 'card', columnId: card.columnId },
  })

  // O card inteiro é a área de arraste, então distinguimos "clique" de
  // "arraste curto" pela distância percorrida pelo ponteiro.
  const down = useRef<{ x: number; y: number } | null>(null)

  // ATENÇÃO: `listeners` do dnd-kit já traz um onPointerDown — é ele que
  // ativa o arraste. Precisamos encadear, nunca sobrescrever.
  const onPointerDown = (e: ReactPointerEvent) => {
    down.current = { x: e.clientX, y: e.clientY }
    listeners?.onPointerDown?.(e)
  }

  const onPointerUp = (e: ReactPointerEvent) => {
    const start = down.current
    down.current = null
    if (!start) return
    const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y)
    if (moved < 5) onOpen(card.id)
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('group relative', isDragging && 'z-10 opacity-40')}
    >
      <CardBody
        card={card}
        className={cn(
          'cursor-grab transition hover:shadow-md hover:ring-slate-900/15 dark:hover:ring-white/20',
          'focus-visible:ring-2 focus-visible:ring-blue-500',
          isDragging && 'cursor-grabbing',
        )}
        dragProps={{ ...attributes, ...listeners, onPointerDown, onPointerUp }}
        action={
          <IconButton
            label="Editar card"
            className="-mt-0.5 -mr-1 opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onOpen(card.id)
            }}
          >
            <PencilIcon className="size-3.5" />
          </IconButton>
        }
      />
    </li>
  )
}

/**
 * Cópia visual para o DragOverlay. Precisa ser um componente separado:
 * reusar o CardView registraria o mesmo id de sortable duas vezes no
 * DndContext e quebraria as medições do dnd-kit.
 */
export function CardPreview({ card }: { card: Card }) {
  return (
    <CardBody
      card={card}
      className="rotate-2 cursor-grabbing shadow-2xl ring-blue-500/40"
    />
  )
}

function CardBody({
  card,
  className,
  dragProps,
  action,
}: {
  card: Card
  className?: string
  dragProps?: Record<string, unknown>
  action?: ReactNode
}) {
  return (
    <div
      {...dragProps}
      className={cn('surface rounded-xl px-3 py-2.5 shadow-sm', className)}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm leading-snug font-medium break-words">
          {card.title}
        </p>
        {action}
      </div>

      {card.tags.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {card.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-md bg-slate-900/5 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-2.5 flex items-center gap-2 text-[11px]">
        <span
          className={cn(
            'rounded-md px-1.5 py-0.5 font-semibold ring-1 ring-inset',
            PRIORITIES[card.priority].chip,
          )}
        >
          {PRIORITIES[card.priority].label}
        </span>

        {card.completedAt ? (
          <span
            className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400"
            title={`Concluído em ${formatDate(card.completedAt)}`}
          >
            <CheckCircleIcon className="size-3.5" />
            {formatDate(card.completedAt)}
          </span>
        ) : null}

        {card.dueDate ? (
          <DueDate value={card.dueDate} done={card.completedAt !== null} />
        ) : null}

        {card.description ? (
          <TextIcon className="size-3.5 text-slate-400" aria-label="Tem descrição" />
        ) : null}
      </div>
    </div>
  )
}

function DueDate({ value, done }: { value: string; done: boolean }) {
  const today = todayIso()
  // Card já concluído não fica gritando "atrasado" — o prazo virou histórico.
  const overdue = !done && value < today
  const isToday = !done && value === today

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-medium',
        overdue
          ? 'text-rose-600 dark:text-rose-400'
          : isToday
            ? 'text-amber-600 dark:text-amber-400'
            : 'text-slate-500 dark:text-slate-400',
      )}
      title={overdue ? 'Prazo vencido' : isToday ? 'Vence hoje' : 'Prazo'}
    >
      <CalendarIcon className="size-3.5" />
      {formatDate(value)}
    </span>
  )
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y.slice(2)}`
}
