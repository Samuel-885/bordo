// Recalibração manual via Google Maps: substitui a chegada prevista na próxima etapa.
// O efeito no cálculo está em previsao.ts; aqui ficam as travas.

import { calcularEstado } from './previsao'
import { antes, truncarMinuto } from './tempo'
import type { DadosPlano, Evento, Instante, PlanoOriginal } from './tipos'

export function validarRecalibracao(
  d: DadosPlano,
  original: PlanoOriginal,
  eventos: readonly Evento[],
  etapaId: string,
  horario: Instante,
  agoraDoRelogio: Instante,
): { ok: true } | { ok: false; motivo: string } {
  const agora = truncarMinuto(agoraDoRelogio)
  const etapa = d.etapas.find((e) => e.id === etapaId)
  if (!etapa) return { ok: false, motivo: 'Etapa não encontrada.' }
  if (etapa.tipo === 'destino') return { ok: false, motivo: 'Não existe recalibração direta do destino.' }

  const estado = calcularEstado(d, original, eventos, agora)
  const indice = estado.etapas.findIndex((e) => e.etapaId === etapaId)
  if (estado.etapas[indice]?.estado !== 'pendente') {
    return { ok: false, motivo: 'Esta etapa já foi alcançada ou pulada.' }
  }
  // "Parado" inclui aguardar a saída na origem.
  const anterior = estado.etapas.slice(0, indice).findLast((e) => e.estado !== 'pulada')
  const tipoAnterior = d.etapas.find((e) => e.id === anterior?.etapaId)?.tipo
  const paradoNaAnterior =
    anterior?.estado === 'em_parada' || (tipoAnterior === 'origem' && anterior?.estado === 'pendente')
  const emTransitoParaEla = estado.emTransito && estado.proximaEtapaId === etapaId
  if (!paradoNaAnterior && !emTransitoParaEla) {
    return { ok: false, motivo: 'A recalibração só vale para a próxima etapa, em trânsito ou parado na etapa anterior.' }
  }
  if (antes(horario, agora)) {
    return { ok: false, motivo: 'O horário informado é anterior ao horário atual.' }
  }
  return { ok: true }
}
