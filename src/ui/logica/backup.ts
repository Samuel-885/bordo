// Textos do backup para as telas. As regras (quando avisar) vêm do núcleo (`core/backup.ts`).

import type { EstadoDoBackup } from '../../core/backup'
import type { Instante } from '../../core/tipos'
import { diasDepois, formatarData, formatarHora } from './horarios'

export const AVISO_PRIVACIDADE_BACKUP =
  'Este arquivo contém os nomes dos passageiros. Trate como confidencial: envie só para você ou para quem for continuar a viagem, e apague depois. ' +
  'Observações e nomes de lugares que você digitou também podem conter nomes.'

/** "14/11/2026 08:12". */
export function dataHoraBr(i: Instante): string {
  const [a, m, d] = formatarData(i).split('-')
  return `${d}/${m}/${a} ${formatarHora(i)}`
}

/** "14/11 08:12". */
export function dataHoraCurta(i: Instante): string {
  const [, m, d] = formatarData(i).split('-')
  return `${d}/${m} ${formatarHora(i)}`
}

/** "hoje 08:12", "ontem 21:40" ou "14/11 21:40". */
export function quandoFoiOBackup(geradoEm: Instante, agora: Instante): string {
  const dias = diasDepois(agora, geradoEm)
  if (dias === 0) return `hoje ${formatarHora(geradoEm)}`
  if (dias === 1) return `ontem ${formatarHora(geradoEm)}`
  const [, m, d] = formatarData(geradoEm).split('-')
  return `${d}/${m} ${formatarHora(geradoEm)}`
}

/** A linha da tela principal: "Último backup: hoje 08:12 · 3 registros depois". */
export function linhaDoUltimoBackup(estado: EstadoDoBackup, agora: Instante): string {
  if (!estado.ultimo) return 'Último backup: nunca'
  const depois =
    estado.registrosDesde > 0 ? ` · ${estado.registrosDesde} ${estado.registrosDesde === 1 ? 'registro depois' : 'registros depois'}` : ''
  return `Último backup: ${quandoFoiOBackup(estado.ultimo.geradoEm, agora)}${depois}`
}

export function textoDoEstadoDaViagem(status: 'planejando' | 'em_andamento' | 'concluida'): string {
  return { planejando: 'Planejando', em_andamento: 'Em andamento', concluida: 'Concluída' }[status]
}
