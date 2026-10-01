import type { Accent, Priority } from './types'

/**
 * Classes Tailwind resolvidas estaticamente — o Tailwind v4 faz scan do
 * fonte, então nada de `bg-${cor}-500` dinâmico (não seria gerado).
 */
export const ACCENTS: Record<Accent, { label: string; dot: string; bar: string; soft: string }> = {
  slate:   { label: 'Cinza',   dot: 'bg-slate-400',   bar: 'bg-slate-400',   soft: 'bg-slate-500/10 text-slate-600 dark:text-slate-300' },
  blue:    { label: 'Azul',    dot: 'bg-blue-500',    bar: 'bg-blue-500',    soft: 'bg-blue-500/10 text-blue-600 dark:text-blue-300' },
  violet:  { label: 'Violeta', dot: 'bg-violet-500',  bar: 'bg-violet-500',  soft: 'bg-violet-500/10 text-violet-600 dark:text-violet-300' },
  emerald: { label: 'Verde',   dot: 'bg-emerald-500', bar: 'bg-emerald-500', soft: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' },
  amber:   { label: 'Âmbar',   dot: 'bg-amber-500',   bar: 'bg-amber-500',   soft: 'bg-amber-500/10 text-amber-600 dark:text-amber-300' },
  rose:    { label: 'Rosa',    dot: 'bg-rose-500',    bar: 'bg-rose-500',    soft: 'bg-rose-500/10 text-rose-600 dark:text-rose-300' },
  cyan:    { label: 'Ciano',   dot: 'bg-cyan-500',    bar: 'bg-cyan-500',    soft: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-300' },
}

export const ACCENT_KEYS = Object.keys(ACCENTS) as Accent[]

export const PRIORITIES: Record<Priority, { label: string; chip: string; rank: number }> = {
  low:    { label: 'Baixa',   chip: 'bg-slate-500/10 text-slate-600 dark:text-slate-300 ring-slate-500/20',    rank: 0 },
  medium: { label: 'Média',   chip: 'bg-blue-500/10 text-blue-600 dark:text-blue-300 ring-blue-500/20',        rank: 1 },
  high:   { label: 'Alta',    chip: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/25',    rank: 2 },
  urgent: { label: 'Urgente', chip: 'bg-rose-500/10 text-rose-600 dark:text-rose-300 ring-rose-500/25',        rank: 3 },
}

export const PRIORITY_KEYS = Object.keys(PRIORITIES) as Priority[]
