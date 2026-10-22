// Textos da tela de alternativas. As regras (classe, margem, impacto, validação) vêm do núcleo.

import type { AvisoAlternativa, ClasseAlternativa } from '../../core/viabilidade'
import { formatarDuracao } from './duracao'

const CLASSES: Record<ClasseAlternativa, string> = {
  viavel: 'Viável',
  pouca_margem: 'Pouca margem',
  inviavel: 'Inviável',
  sem_horario: 'Sem horário',
  sem_tempo: 'Sem tempo',
}

export const rotuloDaClasse = (classe: ClasseAlternativa): string => CLASSES[classe]

const AVISOS: Record<AvisoAlternativa, string> = {
  fora_da_janela: 'Fora da janela',
  onibus_nao_para: 'Ônibus não para',
  onibus_para_nao_sei: 'Não sei se o ônibus para',
  evitar: 'Evitar',
  favorito: 'Favorito',
}

export const textoDoAvisoDaAlternativa = (a: AvisoAlternativa): string => AVISOS[a]

/** "+20 min", "−5 min" (com o sinal de menos tipográfico), "sem mudança". */
export function textoDoImpacto(min: number): string {
  if (min === 0) return 'sem mudança'
  return `${min > 0 ? '+' : '−'}${formatarDuracao(Math.abs(min))}`
}

/** "25 min de margem" ou, se a permanência não cabe, "faltam 5 min". */
export function textoDaMargem(min: number): string {
  return min >= 0 ? `${formatarDuracao(min)} de margem` : `faltam ${formatarDuracao(-min)}`
}

/** Link `tel:` só com dígitos (e o + inicial). Sem dígitos, não há link. */
export function linkTelefone(telefone: string | undefined): string | null {
  if (!telefone) return null
  const digitos = telefone.replace(/\D/g, '')
  if (digitos.length === 0) return null
  return `tel:${telefone.trim().startsWith('+') ? '+' : ''}${digitos}`
}
