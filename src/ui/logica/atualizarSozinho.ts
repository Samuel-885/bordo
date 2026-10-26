// Textos do modo "Atualizar sozinho": o que ele está fazendo, a última atualização e a falha.
// Só formatação; as regras estão em core/atualizacaoAutomatica.ts.

import { formatarHora } from './horarios'
import type { Instante } from '../../core/tipos'

export interface LinhasDoAutomatico {
  pausa: string | null
  lendo: boolean
  ultimaEm: Instante | null
  falha: string | null
  tentaEm: Instante | null
}

/** As linhas do cartão, na ordem em que aparecem. Vazio quando não há nada a dizer. */
export function linhasDoAutomatico(e: LinhasDoAutomatico): string[] {
  const linhas: string[] = []
  if (e.pausa) linhas.push(e.pausa)
  else if (e.lendo) linhas.push('Lendo a posição…')
  if (e.ultimaEm) linhas.push(`Última atualização às ${formatarHora(e.ultimaEm)}`)
  else if (!e.pausa && !e.lendo && !e.falha) linhas.push('Aguardando a primeira leitura…')
  if (e.falha && !e.pausa) {
    linhas.push(`Não atualizou agora: ${e.falha}.${e.tentaEm ? ` Tenta de novo às ${formatarHora(e.tentaEm)}.` : ''}`)
  }
  return linhas
}
