// Modo noite: automático das 18:00 às 06:00 pelo agora() (vale também na demonstração),
// ou fixo pela escolha da pessoa. Função pura; quem guarda a escolha é src/ui/tema.ts.

import type { Instante } from '../../core/tipos'
import { formatarHora } from './horarios'

export type PreferenciaTema = 'automatico' | 'claro' | 'escuro'
export type Tema = 'claro' | 'escuro'

export const PREFERENCIAS: PreferenciaTema[] = ['automatico', 'claro', 'escuro']
export const ROTULO_PREFERENCIA: Record<PreferenciaTema, string> = {
  automatico: 'Automático',
  claro: 'Sempre claro',
  escuro: 'Sempre escuro',
}

/** Hora cheia em que a noite começa e em que termina. */
export const INICIO_DA_NOITE = 18
export const FIM_DA_NOITE = 6

export function ehPreferenciaTema(v: unknown): v is PreferenciaTema {
  return v === 'automatico' || v === 'claro' || v === 'escuro'
}

/** É noite das 18:00 (inclusive) às 06:00 (exclusive). */
export function ehNoite(agora: Instante): boolean {
  const hora = Number(formatarHora(agora).slice(0, 2))
  return hora >= INICIO_DA_NOITE || hora < FIM_DA_NOITE
}

export function temaEfetivo(preferencia: PreferenciaTema, agora: Instante): Tema {
  if (preferencia === 'claro') return 'claro'
  if (preferencia === 'escuro') return 'escuro'
  return ehNoite(agora) ? 'escuro' : 'claro'
}

/** Cor da barra do navegador em cada tema (igual ao fundo da tela). */
export const COR_DO_NAVEGADOR: Record<Tema, string> = { claro: '#f3f5f2', escuro: '#0e1513' }
