// Atualizar pela localização (núcleo): prévia, fator, precisão do GPS, validade e o evento
// opcional e aditivo (mesmas travas da recalibração; backup formato 1 lê os arquivos antigos).

import { describe, expect, it } from 'vitest'
import { montarBackup, serializarBackup, validarBackup, type ConteudoBackup } from '../backup'
import { CONFIG } from '../config'
import { criarEvento } from '../eventos'
import {
  chegadaDaPrevia,
  criarPrevia,
  ehErroDeGps,
  minutosDaPrevia,
  posicaoValida,
  previaVencida,
  textoDaPrecisaoDoGps,
  textoDoErroDeGps,
} from '../localizacao'
import { calcularEstado } from '../previsao'
import { instante } from '../tempo'
import { validarRecalibracao } from '../recalibracao'
import { ETAPAS, EVENTOS_CASO_3, LOCAIS, PLANO, congelar, esperarHorario, etapaDe, ev, h } from './fixtures'

const ROTA = { minutosCarro: 17, distanciaKm: 12.4 }

describe('localizacao: prévia', () => {
  it('chegada = momento do cálculo (minuto cheio) + tempo de carro × fator ônibus, para cima', () => {
    const previa = criarPrevia(ROTA, 20, h('08:20'))
    expect(minutosDaPrevia(previa, 1.15, true)).toBe(20) // 17 × 1,15 = 19,55 → 20
    esperarHorario(chegadaDaPrevia(previa, 1.15, true), h('08:40'))
  })

  it('sem o fator, vale o tempo de carro, e o horário muda na hora', () => {
    const previa = criarPrevia(ROTA, 20, h('08:20'))
    esperarHorario(chegadaDaPrevia(previa, 1.15, false), h('08:37'))
    esperarHorario(chegadaDaPrevia(previa, 1.15, true), h('08:40'))
  })

  it('o momento do cálculo é arredondado para baixo, para o minuto', () => {
    const previa = criarPrevia(ROTA, 20, instante('2026-11-14T08:20:59-03:00'))
    esperarHorario(previa.calculadoEm, h('08:20'))
  })

  it('vale por pouco tempo: vencida a partir de previaLocalizacaoValidaMin minutos', () => {
    const previa = criarPrevia(ROTA, 20, h('08:20'))
    expect(previaVencida(previa, h('08:21'))).toBe(false)
    expect(CONFIG.previaLocalizacaoValidaMin).toBe(2)
    expect(previaVencida(previa, h('08:22'))).toBe(true)
    expect(previaVencida(previa, h('08:30'))).toBe(true)
  })
})

describe('localizacao: precisão do GPS', () => {
  it('até 1 km não avisa; acima de 1 km avisa "posição aproximada (±X km)" sem bloquear', () => {
    expect(criarPrevia(ROTA, 1000, h('08:20')).precisaoRuimM).toBeNull()
    expect(textoDaPrecisaoDoGps(null)).toBeNull()
    const ruim = criarPrevia(ROTA, 1800, h('08:20'))
    expect(ruim.precisaoRuimM).toBe(1800)
    expect(textoDaPrecisaoDoGps(ruim.precisaoRuimM)).toBe('posição aproximada (±1,8 km)')
    // a prévia continua calculada: o aviso não impede a confirmação
    esperarHorario(chegadaDaPrevia(ruim, 1.15, true), h('08:40'))
  })

  it('1001 m já avisa', () => {
    expect(criarPrevia(ROTA, 1001, h('08:20')).precisaoRuimM).toBe(1001)
  })

  it('posição inválida (NaN, fora dos limites) é recusada', () => {
    expect(posicaoValida({ lat: -19.4, lng: -42.5, precisaoM: 20 })).toBe(true)
    expect(posicaoValida({ lat: Number.NaN, lng: -42.5, precisaoM: 20 })).toBe(false)
    expect(posicaoValida({ lat: 91, lng: -42.5, precisaoM: 20 })).toBe(false)
    expect(posicaoValida({ lat: -19.4, lng: -42.5, precisaoM: -1 })).toBe(false)
  })

  it('cada falha do GPS tem mensagem própria, e todas oferecem digitar o horário', () => {
    const textos = (['negada', 'sem_sinal', 'gps_tempo_esgotado', 'sem_suporte'] as const).map(textoDoErroDeGps)
    expect(new Set(textos).size).toBe(4)
    for (const t of textos) expect(t).toContain('Google Maps')
    expect(ehErroDeGps('negada')).toBe(true)
    expect(ehErroDeGps('sem_internet')).toBe(false)
  })
})

describe('localizacao: o evento de recalibração', () => {
  const original = congelar()
  // Caso 3, 11:40: em trânsito para o almoço.
  const base = EVENTOS_CASO_3

  it('passa pelas mesmas travas: horário anterior a agora é recusado; no futuro vale', () => {
    expect(validarRecalibracao(PLANO, original, base, 'almoco', h('11:39'), h('11:40')).ok).toBe(false)
    expect(validarRecalibracao(PLANO, original, base, 'almoco', h('12:00'), h('11:40'))).toEqual({ ok: true })
  })

  it('a previsão é o horário calculado, com a origem "pela localização" e a hora do cálculo', () => {
    const eventos = [...base, ev.recalibracaoPelaLocalizacao('almoco', h('13:02'), h('11:40'), h('11:41'))]
    const estado = calcularEstado(PLANO, original, eventos, h('11:41'))
    const chegada = etapaDe(estado, 'almoco').chegada
    esperarHorario(chegada?.instante, h('13:02'))
    expect(chegada?.origem).toBe('recalibracao')
    esperarHorario(chegada?.pelaLocalizacaoEm, h('11:40'))
    // mesma conta de uma recalibração comum: destino 00:32, atraso +62 (caso 6)
    esperarHorario(estado.chegadaDestino?.instante, h('00:32', 1))
    expect(estado.atrasoDestinoMin).toBe(62)
  })

  it('uma recalibração comum depois substitui a da localização, sem a marca', () => {
    const eventos = [
      ...base,
      ev.recalibracaoPelaLocalizacao('almoco', h('13:02'), h('11:40'), h('11:41')),
      ev.recalibracao('almoco', h('13:10'), h('11:45')),
    ]
    const chegada = etapaDe(calcularEstado(PLANO, original, eventos, h('11:45')), 'almoco').chegada
    esperarHorario(chegada?.instante, h('13:10'))
    expect(chegada?.pelaLocalizacaoEm).toBeUndefined()
  })

  it('a regra do relógio vale por cima: previsão no passado volta ao horário atual, sem a marca', () => {
    const eventos = [...base, ev.recalibracaoPelaLocalizacao('almoco', h('12:00'), h('11:40'), h('11:41'))]
    const chegada = etapaDe(calcularEstado(PLANO, original, eventos, h('12:30')), 'almoco').chegada
    expect(chegada?.origem).toBe('relogio')
    expect(chegada?.pelaLocalizacaoEm).toBeUndefined()
  })

  it('o horário do cálculo também é arredondado para o minuto', () => {
    const e = criarEvento(
      { id: 'x', viagemId: 'v', horarioFato: h('11:41'), registradoEm: h('11:41') },
      { tipo: 'recalibracao', etapaId: 'almoco', dados: { horario: h('13:02'), origem: 'localizacao', calculadoEm: instante('2026-11-14T11:40:45-03:00') } },
    )
    expect(e.tipo === 'recalibracao' && e.dados.calculadoEm).toBe(h('11:40'))
  })
})

describe('localizacao: backup formato 1', () => {
  const conteudo = (eventos: ConteudoBackup['eventos']): ConteudoBackup => ({
    viagens: [{ ...PLANO.viagem, planoOriginal: congelar() }],
    etapas: ETAPAS,
    locais: LOCAIS,
    trechos: [],
    eventos,
    passageiros: [],
    modelos: [],
  })
  const ida = async (eventos: ConteudoBackup['eventos']) => validarBackup(serializarBackup(await montarBackup(conteudo(eventos), h('12:00'))))

  it('guarda e lê a recalibração pela localização', async () => {
    const r = await ida([...EVENTOS_CASO_3, ev.recalibracaoPelaLocalizacao('almoco', h('13:02'), h('11:40'), h('11:41'))])
    expect(r.ok).toBe(true)
  })

  it('lê a recalibração antiga, sem os campos novos', async () => {
    const r = await ida([...EVENTOS_CASO_3, ev.recalibracao('almoco', h('13:02'), h('11:40'))])
    expect(r.ok).toBe(true)
  })

  it('recusa uma origem desconhecida', async () => {
    const ruim = { ...ev.recalibracao('almoco', h('13:02'), h('11:40')), dados: { horario: h('13:02'), origem: 'gps' } } as never
    const r = await ida([...EVENTOS_CASO_3, ruim])
    expect(r.ok).toBe(false)
  })
})
