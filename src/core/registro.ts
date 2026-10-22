// Leitura e validação dos registros da tela principal: situação da viagem, cronômetro,
// travas de chegada, saída e correção. Funções puras, sem efeito no cálculo da previsão.

import { contextoDeDescidaNaEtapa, contextoDeDescidaNaoPlanejada, validarConferencia, validarStatus } from './conferencia'
import { passageirosEmTransito, passageirosEsperados } from './passageiros'
import { calcularEstado, validarPulo } from './previsao'
import { validarTroca } from './viabilidade'
import { validarRecalibracao } from './recalibracao'
import { antes, mesmoInstante, naHoraDoDia, ordenarPor, truncarMinuto } from './tempo'
import { ordenarEtapas } from './trechos'
import type { ConteudoEvento } from './eventos'
import type { DadosPlano, EstadoViagem, Etapa, Evento, Instante, MotivoParada, Passageiro, PlanoOriginal } from './tipos'

export type Resultado = { ok: true } | { ok: false; motivo: string }

// ---------- Rótulo de horário ----------

/** "HH:MM" se for hoje; "HH:MM do dia 14" se for outro dia. */
export function rotuloHorario(i: Instante, agora: Instante): string {
  const t = truncarMinuto(i)
  const hora = t.slice(11, 16)
  const hoje = mesmoInstante(naHoraDoDia(t, '00:00'), naHoraDoDia(agora, '00:00'))
  return hoje ? hora : `${hora} do dia ${Number(t.slice(8, 10))}`
}

/**
 * O horário digitado ("HH:MM") vira a ocorrência mais recente que não seja depois
 * de agora: hoje, ou ontem se hoje ainda não chegou a essa hora.
 */
export function resolverHoraPassada(hora: string, agora: Instante): Instante {
  const ref = truncarMinuto(agora)
  const hoje = naHoraDoDia(ref, hora)
  return antes(ref, hoje) ? naHoraDoDia(ref, hora, -1) : hoje
}

// ---------- Parada não planejada em aberto ----------

export interface ParadaAberta {
  etapaId: string
  inicio: Instante
  motivo?: MotivoParada
}

/** PARAMOS sem VOLTAMOS no trecho que chega em `etapaId` (ou em qualquer etapa, sem o argumento). */
export function paradaAberta(eventos: readonly Evento[], etapaId?: string): ParadaAberta | null {
  const abertas = new Map<string, ParadaAberta>()
  for (const e of ordenarPor(eventos, (x) => x.horarioFato)) {
    if (e.tipo !== 'parada_nao_planejada') continue
    if (e.dados.fase === 'inicio' && !abertas.has(e.etapaId)) {
      abertas.set(e.etapaId, { etapaId: e.etapaId, inicio: e.horarioFato, motivo: e.dados.motivo })
    }
    if (e.dados.fase === 'fim') abertas.delete(e.etapaId)
  }
  if (etapaId !== undefined) return abertas.get(etapaId) ?? null
  return [...abertas.values()][0] ?? null
}

// ---------- Situação e cronômetro ----------

export type Situacao = 'aguardando_saida' | 'em_viagem' | 'em_parada' | 'parada_nao_planejada' | 'chegamos'

export interface Cronometro {
  etapaId: string
  planejadoMin: number
  decorridoMin: number
  /** Zero ao passar do planejado. */
  faltaMin: number
  /** Zero até passar do planejado. */
  excedeuMin: number
}

export interface SituacaoViagem {
  situacao: Situacao
  estado: EstadoViagem
  /** Etapa em parada ou, aguardando saída, a origem. Vazio em trânsito e ao chegar. */
  etapaAtualId: string | null
  /**
   * A próxima etapa a alcançar: a primeira pendente que não é a origem. Aguardando a
   * saída, é a etapa depois da origem. Vazio ao chegar.
   */
  proximaEtapaId: string | null
  paradaNaoPlanejada: (ParadaAberta & { decorridoMin: number }) | null
  cronometro: Cronometro | null
}

export function situacaoDaViagem(
  d: DadosPlano,
  original: PlanoOriginal,
  eventos: readonly Evento[],
  agoraDoRelogio: Instante,
): SituacaoViagem {
  const agora = truncarMinuto(agoraDoRelogio)
  const estado = calcularEstado(d, original, eventos, agora)
  const tipoDe = new Map(d.etapas.map((e) => [e.id, e.tipo]))
  const destino = estado.etapas.find((e) => tipoDe.get(e.etapaId) === 'destino')
  const proximaEtapaId = estado.etapas.find((e) => e.estado === 'pendente' && tipoDe.get(e.etapaId) !== 'origem')?.etapaId ?? null
  const base = { estado, proximaEtapaId, paradaNaoPlanejada: null, cronometro: null }

  if (destino?.chegada?.origem === 'real') {
    return { ...base, situacao: 'chegamos', etapaAtualId: null, proximaEtapaId: null }
  }

  const emParada = estado.etapas.find((e) => e.estado === 'em_parada')
  if (emParada) {
    const etapa = d.etapas.find((e) => e.id === emParada.etapaId)!
    const decorrido = emParada.chegada ? Math.max(0, minutosEntre(agora, emParada.chegada.instante)) : 0
    return {
      ...base,
      situacao: 'em_parada',
      etapaAtualId: emParada.etapaId,
      cronometro: {
        etapaId: emParada.etapaId,
        planejadoMin: etapa.permanenciaMin,
        decorridoMin: decorrido,
        faltaMin: Math.max(0, etapa.permanenciaMin - decorrido),
        excedeuMin: Math.max(0, decorrido - etapa.permanenciaMin),
      },
    }
  }

  if (!estado.emTransito) {
    const origem = estado.etapas.find((e) => tipoDe.get(e.etapaId) === 'origem')
    return { ...base, situacao: 'aguardando_saida', etapaAtualId: origem?.etapaId ?? null }
  }

  const aberta = proximaEtapaId ? paradaAberta(eventos, proximaEtapaId) : null
  if (aberta) {
    return {
      ...base,
      situacao: 'parada_nao_planejada',
      etapaAtualId: null,
      paradaNaoPlanejada: { ...aberta, decorridoMin: Math.max(0, minutosEntre(agora, aberta.inicio)) },
    }
  }
  return { ...base, situacao: 'em_viagem', etapaAtualId: null }
}

function minutosEntre(a: Instante, b: Instante): number {
  return (Date.parse(a) - Date.parse(b)) / 60_000
}

// ---------- Travas de horário de chegada e saída ----------

export interface AlvoHorario {
  tipo: 'chegada' | 'saida'
  etapaId: string
}

export interface LimiteHorario {
  instante: Instante
  /** Frase da trava, para mostrar quando o horário a viola. */
  motivo: string
}

export interface LimitesHorario {
  /** Vazio quando não há trava inferior. */
  minimo: LimiteHorario | null
  /** Sempre existe: no mínimo, agora. */
  maximo: LimiteHorario
}

function momentosReais(eventos: readonly Evento[]) {
  const chegada = new Map<string, Instante>()
  const saida = new Map<string, Instante>()
  const puladas = new Set<string>()
  for (const e of eventos) {
    if (e.tipo === 'chegada') chegada.set(e.etapaId, e.horarioFato)
    if (e.tipo === 'saida') saida.set(e.etapaId, e.horarioFato)
    if (e.tipo === 'pular_etapa') puladas.add(e.etapaId)
  }
  return { chegada, saida, puladas }
}

/**
 * Travas da especificação: não depois de agora; chegada não antes da saída anterior;
 * saída não antes da chegada da mesma etapa. Decisão da fase 4: também a chegada não
 * depois da saída da própria etapa e a saída não depois da chegada da etapa seguinte.
 */
export function limitesDoHorario(
  d: DadosPlano,
  eventos: readonly Evento[],
  alvo: AlvoHorario,
  agoraDoRelogio: Instante,
): LimitesHorario {
  const agora = truncarMinuto(agoraDoRelogio)
  const { chegada, saida, puladas } = momentosReais(eventos)
  const ativas: Etapa[] = ordenarEtapas(d.etapas).filter((e) => !puladas.has(e.id))
  const i = ativas.findIndex((e) => e.id === alvo.etapaId)
  const anterior = i > 0 ? ativas[i - 1] : undefined
  const proxima = i >= 0 ? ativas[i + 1] : undefined

  let minimo: LimiteHorario | null = null
  let maximo: LimiteHorario = { instante: agora, motivo: `Não pode ser depois de agora (${rotuloHorario(agora, agora)}).` }
  const apertar = (limite: LimiteHorario | null, tipo: 'minimo' | 'maximo') => {
    if (!limite) return
    if (tipo === 'minimo' && (!minimo || antes(minimo.instante, limite.instante))) minimo = limite
    if (tipo === 'maximo' && antes(limite.instante, maximo.instante)) maximo = limite
  }

  if (alvo.tipo === 'chegada') {
    const saidaAnterior = anterior ? saida.get(anterior.id) : undefined
    if (saidaAnterior) {
      apertar(
        { instante: saidaAnterior, motivo: `A chegada não pode ser antes da saída anterior (${rotuloHorario(saidaAnterior, agora)}).` },
        'minimo',
      )
    }
    const propriaSaida = saida.get(alvo.etapaId)
    if (propriaSaida) {
      apertar(
        { instante: propriaSaida, motivo: `A chegada não pode ser depois da saída desta etapa (${rotuloHorario(propriaSaida, agora)}).` },
        'maximo',
      )
    }
  } else {
    const propriaChegada = chegada.get(alvo.etapaId)
    if (propriaChegada) {
      apertar(
        { instante: propriaChegada, motivo: `A saída não pode ser antes da chegada desta etapa (${rotuloHorario(propriaChegada, agora)}).` },
        'minimo',
      )
    }
    const chegadaSeguinte = proxima ? chegada.get(proxima.id) : undefined
    if (chegadaSeguinte) {
      apertar(
        { instante: chegadaSeguinte, motivo: `A saída não pode ser depois da chegada da etapa seguinte (${rotuloHorario(chegadaSeguinte, agora)}).` },
        'maximo',
      )
    }
  }
  return { minimo, maximo }
}

export function validarHorario(
  d: DadosPlano,
  eventos: readonly Evento[],
  alvo: AlvoHorario,
  horario: Instante,
  agoraDoRelogio: Instante,
): Resultado {
  const h = truncarMinuto(horario)
  const { minimo, maximo } = limitesDoHorario(d, eventos, alvo, agoraDoRelogio)
  if (minimo && antes(h, minimo.instante)) return { ok: false, motivo: minimo.motivo }
  if (antes(maximo.instante, h)) return { ok: false, motivo: maximo.motivo }
  return { ok: true }
}

/** Correção pela timeline: só chegadas e saídas, com as mesmas travas. */
export function validarCorrecao(
  d: DadosPlano,
  eventos: readonly Evento[],
  eventoId: string,
  novoHorario: Instante,
  agoraDoRelogio: Instante,
): Resultado {
  const evento = eventos.find((e) => e.id === eventoId)
  if (!evento) return { ok: false, motivo: 'Evento não encontrado.' }
  if (evento.tipo !== 'chegada' && evento.tipo !== 'saida') {
    return { ok: false, motivo: 'Só chegadas e saídas podem ser corrigidas.' }
  }
  return validarHorario(d, eventos, { tipo: evento.tipo, etapaId: evento.etapaId }, novoHorario, agoraDoRelogio)
}

// ---------- Registro pelos botões ----------

/**
 * Valida um registro novo, no horário `horario` (normalmente agora; pode ser anterior
 * em imprevisto, em VOLTAMOS e em registro esquecido). Cada tipo só vale no estado certo.
 */
export function validarRegistro(
  d: DadosPlano,
  original: PlanoOriginal,
  eventos: readonly Evento[],
  conteudo: ConteudoEvento,
  horario: Instante,
  agoraDoRelogio: Instante,
  /** Sem a lista, conferência e status de passageiro só passam pela trava do horário. */
  passageiros?: readonly Passageiro[],
): Resultado {
  if (d.viagem.status !== 'em_andamento') return { ok: false, motivo: 'A viagem não está em andamento.' }
  const agora = truncarMinuto(agoraDoRelogio)
  const h = truncarMinuto(horario)
  const s = situacaoDaViagem(d, original, eventos, agora)
  const naoDepoisDeAgora = (): Resultado =>
    antes(agora, h) ? { ok: false, motivo: `Não pode ser depois de agora (${rotuloHorario(agora, agora)}).` } : { ok: true }

  switch (conteudo.tipo) {
    case 'chegada': {
      if (s.situacao === 'parada_nao_planejada') {
        return { ok: false, motivo: 'Há uma parada não planejada aberta: informe a que horas voltamos à estrada.' }
      }
      if (s.situacao !== 'em_viagem' || s.proximaEtapaId !== conteudo.etapaId) {
        return { ok: false, motivo: 'Só dá para registrar a chegada na próxima etapa, com o ônibus em viagem.' }
      }
      return validarHorario(d, eventos, { tipo: 'chegada', etapaId: conteudo.etapaId }, h, agora)
    }
    case 'saida': {
      const podeSair =
        (s.situacao === 'aguardando_saida' || s.situacao === 'em_parada') && s.etapaAtualId === conteudo.etapaId
      if (!podeSair) return { ok: false, motivo: 'Só dá para registrar a saída da etapa em que estamos.' }
      return validarHorario(d, eventos, { tipo: 'saida', etapaId: conteudo.etapaId }, h, agora)
    }
    case 'pular_etapa':
      return validarPulo(d, s.estado, conteudo.etapaId)
    case 'recalibracao':
      return validarRecalibracao(d, original, eventos, conteudo.etapaId, conteudo.dados.horario, agora)
    case 'parada_nao_planejada': {
      const aberta = paradaAberta(eventos, conteudo.etapaId)
      if (conteudo.dados.fase === 'inicio') {
        if (s.situacao !== 'em_viagem' || s.proximaEtapaId !== conteudo.etapaId) {
          return { ok: false, motivo: 'PARAMOS só vale com o ônibus em viagem.' }
        }
        return naoDepoisDeAgora()
      }
      if (!aberta) return { ok: false, motivo: 'Não há parada não planejada em andamento.' }
      if (antes(h, aberta.inicio)) {
        return { ok: false, motivo: `A volta não pode ser antes da parada (${rotuloHorario(aberta.inicio, agora)}).` }
      }
      return naoDepoisDeAgora()
    }
    case 'imprevisto':
      if (s.situacao === 'chegamos') return { ok: false, motivo: 'A viagem já chegou ao destino.' }
      return naoDepoisDeAgora()
    case 'troca_local': {
      const antesDoHorario = naoDepoisDeAgora()
      if (!antesDoHorario.ok) return antesDoHorario
      return validarTroca(d, original, eventos, agora, conteudo.etapaId, conteudo.dados.localId)
    }
    case 'conferencia': {
      const antesDoHorario = naoDepoisDeAgora()
      if (!antesDoHorario.ok || !passageiros) return antesDoHorario
      const { momento = 'saida' } = conteudo.dados
      const noLugar =
        momento === 'saida'
          ? s.etapaAtualId === conteudo.etapaId
          : s.situacao === 'em_viagem' && s.proximaEtapaId === conteudo.etapaId
      if (!noLugar) {
        return { ok: false, motivo: momento === 'saida' ? 'Só dá para conferir a etapa em que estamos.' : 'Só dá para conferir na volta à estrada, em viagem.' }
      }
      const esperados =
        momento === 'saida'
          ? passageirosEsperados(conteudo.etapaId, d.etapas, passageiros, eventos)
          : passageirosEmTransito(conteudo.etapaId, d.etapas, passageiros, eventos)
      return validarConferencia(conteudo.dados, esperados)
    }
    case 'desceram': {
      const antesDoHorario = naoDepoisDeAgora()
      if (!antesDoHorario.ok) return antesDoHorario
      const { local, passageiroIds } = conteudo.dados
      const noLugar =
        local === 'etapa'
          ? s.situacao === 'em_parada' && s.etapaAtualId === conteudo.etapaId
          : s.situacao === 'parada_nao_planejada' && s.paradaNaoPlanejada?.etapaId === conteudo.etapaId
      if (!noLugar) {
        return { ok: false, motivo: local === 'etapa' ? 'Só dá para marcar quem desceu na parada em que estamos.' : 'Só dá para marcar quem desceu durante a parada não planejada.' }
      }
      if (!passageiros) return { ok: true }
      const ctx =
        local === 'etapa'
          ? contextoDeDescidaNaEtapa(conteudo.etapaId, d, passageiros, eventos)
          : contextoDeDescidaNaoPlanejada(conteudo.etapaId, d, passageiros, eventos)
      const fora = passageiroIds.filter((id) => !ctx.aBordo.some((p) => p.id === id))
      if (fora.length > 0 || new Set(passageiroIds).size !== passageiroIds.length) {
        return { ok: false, motivo: 'A marcação tem alguém que não está a bordo neste ponto.' }
      }
      return { ok: true }
    }
    case 'status_passageiro': {
      const antesDoHorario = naoDepoisDeAgora()
      if (!antesDoHorario.ok || !passageiros) return antesDoHorario
      const esperados =
        s.etapaAtualId === conteudo.etapaId
          ? passageirosEsperados(conteudo.etapaId, d.etapas, passageiros, eventos)
          : s.situacao === 'em_viagem' && s.proximaEtapaId === conteudo.etapaId
            ? passageirosEmTransito(conteudo.etapaId, d.etapas, passageiros, eventos)
            : null
      if (!esperados) return { ok: false, motivo: 'Só dá para mudar o status de passageiro na etapa em que estamos ou na volta à estrada.' }
      return validarStatus(conteudo.dados.passageiroId, conteudo.dados.status, esperados)
    }
    case 'inicio':
    case 'fim':
      return { ok: false, motivo: 'Este evento é registrado pelo app, não pelos botões.' }
  }
}
