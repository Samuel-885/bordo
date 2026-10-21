// Passageiros esperados a bordo e contagem rápida ("Passageiros e conferência").

import { ordenarPor } from './tempo'
import { ordenarEtapas } from './trechos'
import type { Etapa, Evento, Passageiro, StatusPassageiro } from './tipos'

/**
 * Esperados ao sair da etapa: ativos que embarcam nela ou antes e não desembarcam
 * nela ou antes. Uma mudança de status vale da etapa em que foi registrada em diante.
 */
export function esperadosNaSaida(
  etapaId: string,
  etapas: readonly Etapa[],
  passageiros: readonly Passageiro[],
  eventos: readonly Evento[],
): number {
  const ordem = new Map(ordenarEtapas(etapas).map((e, i) => [e.id, i]))
  const aqui = ordem.get(etapaId)
  if (aqui === undefined) throw new Error(`Etapa não encontrada: ${etapaId}`)

  const status = new Map<string, StatusPassageiro>(passageiros.map((p) => [p.id, p.status]))
  for (const e of ordenarPor(eventos, (x) => x.horarioFato)) {
    if (e.tipo !== 'status_passageiro') continue
    const onde = ordem.get(e.etapaId)
    if (onde !== undefined && onde <= aqui) status.set(e.dados.passageiroId, e.dados.status)
  }

  return passageiros.filter((p) => {
    const embarque = ordem.get(p.etapaEmbarqueId)
    const desembarque = p.etapaDesembarqueId === null ? Infinity : ordem.get(p.etapaDesembarqueId)
    return (
      status.get(p.id) === 'ativo' &&
      embarque !== undefined &&
      embarque <= aqui &&
      desembarque !== undefined &&
      desembarque > aqui
    )
  }).length
}

/**
 * Número digitado igual aos esperados: completa por contagem. Diferente: nada é
 * confirmado e a conferência segue por nome. A contagem não altera ninguém.
 */
export function contagemRapida(
  esperados: number,
  digitado: number,
):
  | { completa: true; resultado: 'completa_por_contagem' }
  | { completa: false; diferenca: number; sentido: 'faltando' | 'sobrando' } {
  if (digitado === esperados) return { completa: true, resultado: 'completa_por_contagem' }
  return {
    completa: false,
    diferenca: Math.abs(esperados - digitado),
    sentido: digitado < esperados ? 'faltando' : 'sobrando',
  }
}
