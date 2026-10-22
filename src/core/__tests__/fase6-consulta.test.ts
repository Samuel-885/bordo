import { describe, expect, it } from 'vitest'
import { baseDaSituacao, chegadaDaConsulta, validarConsulta, vigenciaDaConsulta } from '../consulta'
import { calcularEstado } from '../previsao'
import type { Consulta, DadosPlano, Trecho } from '../tipos'
import { avaliarAlternativas, validarTrocaComChegada } from '../viabilidade'
import { congelar, esperarHorario, ev, h, PLANO, TRECHOS_DAS_ALTERNATIVAS } from './fixtures'

const LOCAIS = PLANO.locais.map((l) => {
  if (l.id === 'l-rest-a') return { ...l, abre: '11:00', fecha: '14:00' }
  if (l.id === 'l-rest-b') return { ...l, abre: '11:00', fecha: '15:00' }
  if (l.id === 'l-rest-c') return { ...l, abre: '11:00', fecha: '16:30' }
  return l
})
const plano = (trechos: Trecho[] = TRECHOS_DAS_ALTERNATIVAS): DadosPlano => ({ ...PLANO, locais: LOCAIS, trechos })
const semTrecho = (o: string, d: string) => TRECHOS_DAS_ALTERNATIVAS.filter((t) => !(t.localOrigemId === o && t.localDestinoId === d))

const PARADOS = [ev.inicio(h('06:00')), ev.saida('origem', h('06:30')), ev.chegada('monlevade', h('08:25'))]
const EM_TRANSITO = [...PARADOS, ev.saida('monlevade', h('10:55'))]

function consulta(c: Partial<Consulta> & Pick<Consulta, 'localId' | 'horario' | 'consultadoEm'>, eventos = EM_TRANSITO): Consulta {
  return { viagemId: PLANO.viagem.id, etapaId: 'almoco', parado: false, base: baseDaSituacao(eventos), ...c }
}

describe('fase 6: vigência da consulta', () => {
  const c = consulta({ localId: 'l-rest-c', horario: h('15:05'), consultadoEm: h('10:57') })

  it('vigente até 30 min; depois, antiga', () => {
    expect(vigenciaDaConsulta(c, EM_TRANSITO, h('10:57'))).toEqual({ situacao: 'vigente', idadeMin: 0 })
    expect(vigenciaDaConsulta(c, EM_TRANSITO, h('11:27'))).toEqual({ situacao: 'vigente', idadeMin: 30 })
    expect(vigenciaDaConsulta(c, EM_TRANSITO, h('11:28'))).toEqual({ situacao: 'antiga', idadeMin: 31 })
  })

  it('em trânsito, o horário consultado que já passou deixa a consulta antiga', () => {
    const curta = consulta({ localId: 'l-rest-c', horario: h('11:10'), consultadoEm: h('10:57') })
    expect(vigenciaDaConsulta(curta, EM_TRANSITO, h('11:11')).situacao).toBe('antiga')
  })

  it('saída, chegada, troca ou pulo depois da consulta a descartam', () => {
    const base = [...PARADOS]
    const feita = consulta({ localId: 'l-rest-c', horario: h('12:00'), consultadoEm: h('08:30'), parado: true }, base)
    expect(vigenciaDaConsulta(feita, base, h('08:31')).situacao).toBe('vigente')
    expect(vigenciaDaConsulta(feita, [...base, ev.saida('monlevade', h('08:40'))], h('08:41')).situacao).toBe('descartada')
    expect(vigenciaDaConsulta(feita, [...base, ev.troca('almoco', 'l-rest-b', h('08:35'))], h('08:36')).situacao).toBe('descartada')
    expect(vigenciaDaConsulta(feita, [...base, ev.pular('cafe', h('08:35'))], h('08:36')).situacao).toBe('descartada')
    expect(vigenciaDaConsulta(c, [...EM_TRANSITO, ev.chegada('almoco', h('15:05'))], h('15:06')).situacao).toBe('descartada')
  })

  it('imprevisto, PARAMOS e recalibração não descartam', () => {
    const outros = [...EM_TRANSITO, ev.parada('almoco', 'inicio', h('11:00')), ev.recalibracao('almoco', h('15:30'), h('11:01'))]
    expect(vigenciaDaConsulta(c, outros, h('11:02')).situacao).toBe('vigente')
  })
})

describe('fase 6: chegada efetiva da consulta', () => {
  it('em trânsito o horário é absoluto', () => {
    const c = consulta({ localId: 'l-rest-c', horario: h('15:05'), consultadoEm: h('10:57') })
    esperarHorario(chegadaDaConsulta(c, h('11:10')), h('15:05'))
  })

  it('feita parado, preserva a duração: consultado às 08:30 com chegada 12:00 e aplicado às 08:38 → 12:08', () => {
    const c = consulta({ localId: 'l-rest-c', horario: h('12:00'), consultadoEm: h('08:30'), parado: true }, PARADOS)
    esperarHorario(chegadaDaConsulta(c, h('08:30')), h('12:00'))
    esperarHorario(chegadaDaConsulta(c, h('08:38')), h('12:08'))
  })

  it('parado: a previsão simulada mantém a duração informada, contada a partir da saída', () => {
    const d = plano()
    const original = congelar(d)
    const c = consulta({ localId: 'l-rest-c', horario: h('12:00'), consultadoEm: h('08:30'), parado: true }, PARADOS)
    // Duração 3h30 a partir da saída prevista de Monlevade (08:40): 12:10.
    const lista = avaliarAlternativas(d, original, PARADOS, h('08:38'), 'almoco', [c])
    const doC = lista.find((a) => a.localId === 'l-rest-c')!
    esperarHorario(doC.chegada, h('12:10'))
    expect(doC.consulta).toMatchObject({ situacao: 'vigente', idadeMin: 8 })
    esperarHorario(doC.consulta?.chegadaEfetiva, h('12:08'))
    // Aplicada como recalibração às 08:38 com a chegada efetiva: o mesmo resultado.
    const aplicada = [...PARADOS, ev.troca('almoco', 'l-rest-c', h('08:38')), ev.recalibracao('almoco', h('12:08'), h('08:38'))]
    esperarHorario(calcularEstado(d, original, aplicada, h('08:38')).etapas.find((e) => e.etapaId === 'almoco')?.chegada?.instante, h('12:10'))
  })
})

describe('fase 6: avaliação com consulta', () => {
  const d = plano()
  const original = congelar(d)
  const avaliar = (consultas: Consulta[], eventos = EM_TRANSITO, agora = h('10:57')) =>
    avaliarAlternativas(d, original, eventos, agora, 'almoco', consultas)
  const por = (lista: ReturnType<typeof avaliar>, id: string) => lista.find((a) => a.localId === id)!

  it('sem consulta, nada muda (caso 9)', () => {
    const lista = avaliar([])
    expect(por(lista, 'l-rest-b')).toMatchObject({ classe: 'pouca_margem', impactoDestinoMin: 20 })
    expect(por(lista, 'l-rest-b').consulta).toBeUndefined()
  })

  it('alternativa consultada: chegada, fim, margem, classe e impacto recalculados', () => {
    const lista = avaliar([consulta({ localId: 'l-rest-b', horario: h('14:00'), consultadoEm: h('10:57') })])
    const b = por(lista, 'l-rest-b')
    esperarHorario(b.chegada, h('14:00'))
    esperarHorario(b.fimParada, h('15:00'))
    expect(b).toMatchObject({ classe: 'pouca_margem', margemMin: 0, impactoDestinoMin: -15 })
    expect(b.consulta).toMatchObject({ situacao: 'vigente', idadeMin: 0 })
    // As outras seguem pelos trechos.
    esperarHorario(por(lista, 'l-rest-c').chegada, h('15:05'))
  })

  it('o escolhido consultado: só a recalibração, com o impacto sobre a previsão atual', () => {
    const lista = avaliar([consulta({ localId: 'l-rest-a', horario: h('14:30'), consultadoEm: h('10:57') })])
    const a = por(lista, 'l-rest-a')
    expect(a).toMatchObject({ escolhida: true, classe: 'inviavel', impactoDestinoMin: 15 })
    esperarHorario(a.chegada, h('14:30'))
  })

  it('a consulta nunca altera a previsão atual, os eventos ou o plano original', () => {
    const antes = JSON.stringify([calcularEstado(d, original, EM_TRANSITO, h('10:57')), EM_TRANSITO, original])
    avaliar([consulta({ localId: 'l-rest-c', horario: h('15:30'), consultadoEm: h('10:57') })])
    expect(JSON.stringify([calcularEstado(d, original, EM_TRANSITO, h('10:57')), EM_TRANSITO, original])).toBe(antes)
  })

  it('consulta antiga aparece marcada, mas não entra no cálculo', () => {
    const c = consulta({ localId: 'l-rest-b', horario: h('14:00'), consultadoEm: h('10:57') })
    const b = por(avaliar([c], EM_TRANSITO, h('11:40')), 'l-rest-b')
    expect(b.consulta).toMatchObject({ situacao: 'antiga', idadeMin: 43 })
    esperarHorario(b.chegada, h('14:35')) // 11:40 não muda o cálculo pelo trecho: saída 10:55 + 3h40
  })

  it('consulta descartada some', () => {
    const c = consulta({ localId: 'l-rest-b', horario: h('14:00'), consultadoEm: h('10:57') }, PARADOS)
    expect(por(avaliar([c]), 'l-rest-b').consulta).toBeUndefined()
  })

  it('com consulta, o trecho de chegada sem tempo não impede; o trecho seguinte continua obrigatório', () => {
    const semChegada = plano(semTrecho('l-monlevade', 'l-rest-c'))
    const o1 = congelar(semChegada)
    const c = consulta({ localId: 'l-rest-c', horario: h('15:05'), consultadoEm: h('10:57') })
    const lista = avaliarAlternativas(semChegada, o1, EM_TRANSITO, h('10:57'), 'almoco', [c])
    expect(por(lista, 'l-rest-c')).toMatchObject({ classe: 'viavel', margemMin: 25, trechosFaltantes: [], exigeChegadaPeloMaps: false })

    const semSeguinte = plano(semTrecho('l-rest-c', 'l-cafe'))
    const o2 = congelar(semSeguinte)
    const lista2 = avaliarAlternativas(semSeguinte, o2, EM_TRANSITO, h('10:57'), 'almoco', [c])
    expect(por(lista2, 'l-rest-c').trechosFaltantes).toHaveLength(1)
    expect(validarTrocaComChegada(semSeguinte, o2, EM_TRANSITO, h('10:57'), 'almoco', 'l-rest-c', h('15:05'))).toMatchObject({ ok: false })
  })

  it('parado na etapa anterior, o trecho de chegada sem tempo também não impede', () => {
    const semChegada = plano(semTrecho('l-monlevade', 'l-rest-c'))
    const c = consulta({ localId: 'l-rest-c', horario: h('12:00'), consultadoEm: h('08:30'), parado: true }, PARADOS)
    const lista = avaliarAlternativas(semChegada, congelar(semChegada), PARADOS, h('08:30'), 'almoco', [c])
    expect(por(lista, 'l-rest-c')).toMatchObject({ classe: 'viavel', trechosFaltantes: [] })
    expect(validarTrocaComChegada(semChegada, congelar(semChegada), PARADOS, h('08:30'), 'almoco', 'l-rest-c', h('12:00'))).toEqual({ ok: true })
  })
})

describe('fase 6: validar a consulta', () => {
  const d = plano()
  const original = congelar(d)
  const validar = (eventos: typeof EM_TRANSITO, localId: string, horario: string, agora = h('10:57'), etapaId = 'almoco') =>
    validarConsulta(d, original, eventos, agora, etapaId, localId, h(horario))

  it('em trânsito para a próxima parada flexível: ok, absoluta', () => {
    expect(validar(EM_TRANSITO, 'l-rest-c', '15:05')).toEqual({ ok: true, parado: false, base: baseDaSituacao(EM_TRANSITO) })
  })

  it('parado na etapa anterior: ok, marcada como parado', () => {
    expect(validar(PARADOS, 'l-rest-b', '12:00', h('08:30'))).toMatchObject({ ok: true, parado: true })
  })

  it('aguardando a saída da origem a próxima etapa é Monlevade (obrigatória): sem consulta', () => {
    expect(validar([ev.inicio(h('06:00'))], 'l-rest-b', '12:00', h('06:10'))).toMatchObject({ ok: false })
  })

  it('recusa horário anterior a agora (mesma trava da recalibração)', () => {
    expect(validar(EM_TRANSITO, 'l-rest-c', '10:50')).toEqual({ ok: false, motivo: 'O horário informado é anterior ao horário atual.' })
  })

  it('recusa parada que não é a próxima, local fora dos candidatos e etapa que não é flexível', () => {
    expect(validar(EM_TRANSITO, 'l-cafe', '19:00', h('10:57'), 'cafe')).toMatchObject({ ok: false, motivo: 'A consulta só vale para a próxima parada.' })
    expect(validar(EM_TRANSITO, 'l-cafe', '15:05')).toMatchObject({ ok: false })
    expect(validar(EM_TRANSITO, 'l-monlevade', '15:05', h('10:57'), 'monlevade')).toMatchObject({ ok: false })
  })

  it('recusa quando a parada já foi alcançada', () => {
    expect(validar([...EM_TRANSITO, ev.chegada('almoco', h('14:15'))], 'l-rest-c', '15:30', h('14:20'))).toMatchObject({ ok: false })
  })
})
