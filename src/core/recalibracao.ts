// Recalibração manual via Google Maps: substitui a chegada prevista na próxima etapa.
// O efeito no cálculo está em previsao.ts; aqui ficam as travas.

import { calcularEstado } from './previsao'
import { antes } from './tempo'
import type { DadosPlano, Evento, Instante, PlanoOriginal } from './tipos'

export function validarRecalibracao(
  d: DadosPlano,
  original: PlanoOriginal,
  eventos: readonly Evento[],
  etapaId: string,
  horario: Instante,
  agora: Instante,
): { ok: true } | { ok: false; motivo: string } {
  const etapa = d.etapas.find((e) => e.id === etapaId)
  if (!etapa) return { ok: false, motivo: 'Etapa não encontrada.' }
  if (etapa.tipo === 'destino') return { ok: false, motivo: 'Não existe recalibração direta do destino.' }

  const estado = calcularEstado(d, original, eventos, agora)
  if (estado.proximaEtapaId !== etapaId) {
    return { ok: false, motivo: 'Só a próxima etapa pode ser recalibrada.' }
  }
  const indice = estado.etapas.findIndex((e) => e.etapaId === etapaId)
  const anterior = estado.etapas.slice(0, indice).findLast((e) => e.estado !== 'pulada')
  if (!estado.emTransito && anterior?.estado !== 'em_parada') {
    return { ok: false, motivo: 'A recalibração só pode ser feita em trânsito ou parado na etapa anterior.' }
  }
  if (antes(horario, agora)) {
    return { ok: false, motivo: 'O horário informado é anterior ao horário atual.' }
  }
  return { ok: true }
}
