// Passageiros esperados a bordo, contagem rápida e cadastro ("Passageiros e conferência").

import { ordenarPor } from './tempo'
import { ordenarEtapas } from './trechos'
import type { Etapa, Evento, Passageiro, StatusPassageiro } from './tipos'

function ordemDasEtapas(etapas: readonly Etapa[]): Map<string, number> {
  return new Map(ordenarEtapas(etapas).map((e, i) => [e.id, i]))
}

/** Status de cada passageiro considerando as mudanças registradas em etapas até `ate` (inclusive). */
function statusAte(
  passageiros: readonly Passageiro[],
  eventos: readonly Evento[],
  ordem: ReadonlyMap<string, number>,
  ate: number,
): Map<string, StatusPassageiro> {
  const status = new Map<string, StatusPassageiro>(passageiros.map((p) => [p.id, p.status]))
  for (const e of ordenarPor(eventos, (x) => x.horarioFato)) {
    if (e.tipo !== 'status_passageiro') continue
    const onde = ordem.get(e.etapaId)
    if (onde !== undefined && onde <= ate) status.set(e.dados.passageiroId, e.dados.status)
  }
  return status
}

/**
 * Esperados ao sair da etapa: ativos que embarcam nela ou antes e não desembarcam
 * nela ou antes. Uma mudança de status vale da etapa em que foi registrada em diante.
 */
export function passageirosEsperados(
  etapaId: string,
  etapas: readonly Etapa[],
  passageiros: readonly Passageiro[],
  eventos: readonly Evento[],
): Passageiro[] {
  const ordem = ordemDasEtapas(etapas)
  const aqui = ordem.get(etapaId)
  if (aqui === undefined) throw new Error(`Etapa não encontrada: ${etapaId}`)
  const status = statusAte(passageiros, eventos, ordem, aqui)

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
  })
}

/**
 * Quem está a bordo quando o ônibus chega em `etapaId` e segue depois: os esperados na saída
 * que já embarcaram antes dela. É a lista da marcação de "quem desceu" na parada da etapa.
 */
export function passageirosABordoNaParada(
  etapaId: string,
  etapas: readonly Etapa[],
  passageiros: readonly Passageiro[],
  eventos: readonly Evento[],
): Passageiro[] {
  const ordem = ordemDasEtapas(etapas)
  const aqui = ordem.get(etapaId)
  return passageirosEsperados(etapaId, etapas, passageiros, eventos).filter(
    (p) => (ordem.get(p.etapaEmbarqueId) ?? Infinity) < (aqui ?? -Infinity),
  )
}

export function esperadosNaSaida(
  etapaId: string,
  etapas: readonly Etapa[],
  passageiros: readonly Passageiro[],
  eventos: readonly Evento[],
): number {
  return passageirosEsperados(etapaId, etapas, passageiros, eventos).length
}

/**
 * Esperados a bordo no trecho que chega em `proximaEtapaId`: embarcaram antes dela e só
 * desembarcam nela ou depois. Mudanças de status registradas na própria `proximaEtapaId`
 * (a conferência depois de uma parada não planejada) já valem.
 */
export function passageirosEmTransito(
  proximaEtapaId: string,
  etapas: readonly Etapa[],
  passageiros: readonly Passageiro[],
  eventos: readonly Evento[],
): Passageiro[] {
  const ordem = ordemDasEtapas(etapas)
  const destino = ordem.get(proximaEtapaId)
  if (destino === undefined) throw new Error(`Etapa não encontrada: ${proximaEtapaId}`)
  const status = statusAte(passageiros, eventos, ordem, destino)

  return passageiros.filter((p) => {
    const embarque = ordem.get(p.etapaEmbarqueId)
    const desembarque = p.etapaDesembarqueId === null ? Infinity : ordem.get(p.etapaDesembarqueId)
    return (
      status.get(p.id) === 'ativo' &&
      embarque !== undefined &&
      embarque < destino &&
      desembarque !== undefined &&
      desembarque >= destino
    )
  })
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

// ---------- Cadastro ----------

export interface DadosPassageiro {
  nome: string
  etapaEmbarqueId: string
  /** Vazio = destino. */
  etapaDesembarqueId: string | null
}

export type Resultado = { ok: true } | { ok: false; motivo: string }

/**
 * Etapas que aceitam embarque ou desembarque: origem, pontos obrigatórios e destino.
 * Paradas flexíveis podem ser puladas e ficam de fora. Embarque não é no destino e
 * desembarque não é na origem.
 */
export function etapasDeEmbarque(etapas: readonly Etapa[]): Etapa[] {
  return ordenarEtapas(etapas).filter((e) => e.tipo === 'origem' || e.tipo === 'obrigatoria')
}

export function etapasDeDesembarque(etapas: readonly Etapa[]): Etapa[] {
  return ordenarEtapas(etapas).filter((e) => e.tipo === 'obrigatoria' || e.tipo === 'destino')
}

/** Etapas de onde o ônibus já saiu: não aceitam mais embarque nem desembarque novos. */
export function etapasJaDeixadas(eventos: readonly Evento[]): Set<string> {
  return new Set(eventos.flatMap((e) => (e.tipo === 'saida' ? [e.etapaId] : [])))
}

/** Quem já tem status registrado ou aparece em alguma conferência não pode ser excluído nem remanejado. */
export function passageiroNoHistorico(passageiroId: string, eventos: readonly Evento[]): boolean {
  return eventos.some(
    (e) =>
      (e.tipo === 'status_passageiro' && e.dados.passageiroId === passageiroId) ||
      (e.tipo === 'conferencia' && (e.dados.confirmados.includes(passageiroId) || e.dados.pendentes.includes(passageiroId))),
  )
}

/**
 * Valida o cadastro ou a edição. Planejando, vale qualquer etapa permitida. Com a viagem
 * em andamento: só embarque e desembarque em etapas de onde ainda não saímos, e quem já
 * está no histórico só pode mudar o nome. Viagem concluída não aceita mudança.
 */
export function validarCadastro(
  dados: DadosPassageiro,
  etapas: readonly Etapa[],
  contexto: {
    statusViagem: 'planejando' | 'em_andamento' | 'concluida'
    eventos: readonly Evento[]
    /** Vazio para passageiro novo. */
    atual?: Passageiro
  },
): Resultado {
  if (contexto.statusViagem === 'concluida') return { ok: false, motivo: 'A viagem já terminou.' }
  if (!dados.nome.trim()) return { ok: false, motivo: 'Informe o nome.' }

  const ordem = ordemDasEtapas(etapas)
  const embarque = ordem.get(dados.etapaEmbarqueId)
  if (embarque === undefined || !etapasDeEmbarque(etapas).some((e) => e.id === dados.etapaEmbarqueId)) {
    return { ok: false, motivo: 'Escolha o ponto de embarque entre a origem e os pontos obrigatórios.' }
  }
  const desembarque = dados.etapaDesembarqueId === null ? Infinity : ordem.get(dados.etapaDesembarqueId)
  if (
    dados.etapaDesembarqueId !== null &&
    (desembarque === undefined || !etapasDeDesembarque(etapas).some((e) => e.id === dados.etapaDesembarqueId))
  ) {
    return { ok: false, motivo: 'Escolha o desembarque entre os pontos obrigatórios e o destino.' }
  }
  if (desembarque === undefined || desembarque <= embarque) {
    return { ok: false, motivo: 'O desembarque precisa ser depois do embarque.' }
  }

  if (contexto.statusViagem === 'em_andamento') {
    const deixadas = etapasJaDeixadas(contexto.eventos)
    const { atual } = contexto
    const mudaEmbarque = !atual || atual.etapaEmbarqueId !== dados.etapaEmbarqueId
    const mudaDesembarque = !atual || atual.etapaDesembarqueId !== dados.etapaDesembarqueId
    if (atual && (mudaEmbarque || mudaDesembarque) && passageiroNoHistorico(atual.id, contexto.eventos)) {
      return { ok: false, motivo: 'Este passageiro já passou por uma conferência: só o nome pode mudar.' }
    }
    if (mudaEmbarque && deixadas.has(dados.etapaEmbarqueId)) {
      return { ok: false, motivo: 'O ônibus já saiu desse ponto de embarque.' }
    }
    if (mudaDesembarque && dados.etapaDesembarqueId !== null && deixadas.has(dados.etapaDesembarqueId)) {
      return { ok: false, motivo: 'O ônibus já saiu desse ponto de desembarque.' }
    }
  }
  return { ok: true }
}

/** Excluir: livre planejando; em andamento, só quem nunca apareceu em conferência nem teve status. */
export function validarExclusao(
  passageiroId: string,
  contexto: { statusViagem: 'planejando' | 'em_andamento' | 'concluida'; eventos: readonly Evento[] },
): Resultado {
  if (contexto.statusViagem === 'concluida') return { ok: false, motivo: 'A viagem já terminou.' }
  if (contexto.statusViagem === 'em_andamento' && passageiroNoHistorico(passageiroId, contexto.eventos)) {
    return { ok: false, motivo: 'Este passageiro já passou por uma conferência e não pode ser excluído.' }
  }
  return { ok: true }
}
