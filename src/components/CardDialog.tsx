import { useEffect, useState } from 'react'
import { PRIORITIES, PRIORITY_KEYS } from '../domain/accents'
import { todayIso } from '../domain/ids'
import type { Card, Column, Priority } from '../domain/types'
import type { CardDraft } from '../store/boardStore'
import { CopyIcon, TrashIcon } from './icons'
import { Button, Field, Input, Modal, Select, Textarea } from './ui'

interface Props {
  card: Card | null
  columns: Column[]
  onClose: () => void
  onSave: (id: string, draft: CardDraft) => void
  onMove: (id: string, columnId: string) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
}

export function CardDialog({
  card,
  columns,
  onClose,
  onSave,
  onMove,
  onDelete,
  onDuplicate,
}: Props) {
  const [draft, setDraft] = useState<CardDraft | null>(null)
  const [tagsText, setTagsText] = useState('')

  // Recarrega o formulário sempre que outro card é aberto.
  useEffect(() => {
    if (!card) {
      setDraft(null)
      return
    }
    setDraft({
      title: card.title,
      description: card.description,
      priority: card.priority,
      dueDate: card.dueDate,
      completedAt: card.completedAt,
      tags: card.tags,
    })
    setTagsText(card.tags.join(', '))
  }, [card])

  if (!card || !draft) return null

  const commit = () => {
    onSave(card.id, { ...draft, tags: parseTags(tagsText) })
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Editar card"
      width="max-w-xl"
      footer={
        <>
          <Button
            variant="ghost"
            className="mr-auto text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
            onClick={() => {
              onDelete(card.id)
              onClose()
            }}
          >
            <TrashIcon className="size-4" />
            Excluir
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              onDuplicate(card.id)
              onClose()
            }}
          >
            <CopyIcon className="size-4" />
            Duplicar
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={commit}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Título">
          <Input
            autoFocus
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
            }}
          />
        </Field>

        <Field label="Descrição">
          <Textarea
            rows={5}
            value={draft.description}
            placeholder="Detalhes, critérios de aceite, links…"
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Prioridade">
            <Select
              value={draft.priority}
              onChange={(e) =>
                setDraft({ ...draft, priority: e.target.value as Priority })
              }
            >
              {PRIORITY_KEYS.map((key) => (
                <option key={key} value={key}>
                  {PRIORITIES[key].label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Prazo">
            <Input
              type="date"
              value={draft.dueDate ?? ''}
              onChange={(e) =>
                setDraft({ ...draft, dueDate: e.target.value || null })
              }
            />
          </Field>

          <Field label="Coluna">
            <Select
              value={card.columnId}
              onChange={(e) => onMove(card.id, e.target.value)}
            >
              {columns.map((column) => (
                <option key={column.id} value={column.id}>
                  {column.title}
                  {column.isDone ? ' ✓' : ''}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Concluído em"
            hint="Preenchida sozinha ao mover para uma coluna de conclusão, se estiver vazia. Editável sempre."
          >
            <div className="flex gap-1.5">
              <Input
                type="date"
                value={draft.completedAt ?? ''}
                onChange={(e) =>
                  setDraft({ ...draft, completedAt: e.target.value || null })
                }
              />
              {draft.completedAt ? (
                <Button
                  variant="ghost"
                  onClick={() => setDraft({ ...draft, completedAt: null })}
                  title="Limpar data de conclusão"
                >
                  Limpar
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  onClick={() => setDraft({ ...draft, completedAt: todayIso() })}
                  title="Marcar como concluído hoje"
                >
                  Hoje
                </Button>
              )}
            </div>
          </Field>
        </div>

        <Field label="Etiquetas" hint="Separe por vírgula.">
          <Input
            value={tagsText}
            placeholder="backend, urgente"
            onChange={(e) => setTagsText(e.target.value)}
          />
        </Field>

        <p className="text-xs text-slate-400">
          Criado em {formatDateTime(card.createdAt)} · atualizado em{' '}
          {formatDateTime(card.updatedAt)}
        </p>
      </div>
    </Modal>
  )
}

function parseTags(text: string): string[] {
  const seen = new Set<string>()
  return text
    .split(',')
    .map((t) => t.trim())
    .filter((t) => {
      if (!t || seen.has(t.toLowerCase())) return false
      seen.add(t.toLowerCase())
      return true
    })
    .slice(0, 8)
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}
