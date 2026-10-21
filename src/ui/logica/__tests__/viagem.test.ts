import { describe, expect, it } from 'vitest'
import { calcularPlanoOriginal } from '../../../core/previsao'
import { criarEvento } from '../../../core/eventos'
import { ETAPA, horaDemo, LOCAL, PLANO_DEMO } from '../../../demo/dados'
import { MOTIVOS_DE_PARADA } from '../rotulos'
import { avisoDeDia, horaValida, resolverHorarioPassado, resolverHorarioProximo } from '../horarioDigitado'
import { linkGoogleMaps } from '../linkMaps'
import { mesmoInstante } from '../../../core/tempo'
import { montarTimeline, textoDaOrigemDaPrevisao, textoDaSituacao, textoDoAtraso, textoDoCronometro, textoDoTempoRestante } from '../textosViagem'

describe('link do Google Maps', () => {
  it('usa coordenadas; sem elas, nome e cidade; sem local, nada', () => {
    expect(linkGoogleMaps({ nome: 'X', cidade: 'Y', coordenadas: { lat: -19.5, lng: -42.6 } })).toBe(
      'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=-19.5,-42.6',
    )
    expect(linkGoogleMaps({ nome: 'Restaurante A', cidade: 'João Monlevade' })).toContain('destination=Restaurante%20A%2C%20Jo%C3%A3o%20Monlevade')
    expect(linkGoogleMaps(undefined)).toBeNull()
  })
})

describe('horário digitado', () => {
  it('valida HH:MM', () => {
    expect(horaValida('08:05')).toBe(true)
    expect(horaValida('8:05')).toBe(false)
    expect(horaValida('24:00')).toBe(false)
  })

  it('passado: mais recente não depois de agora, com o dia quando não é hoje', () => {
    const agora = horaDemo('00:10', 1)
    const r = resolverHorarioPassado('23:55', agora)!
    expect(mesmoInstante(r, horaDemo('23:55'))).toBe(true)
    expect(avisoDeDia(r, agora)).toBe('23:55 do dia 14')
    expect(avisoDeDia(resolverHorarioPassado('00:05', agora), agora)).toBeNull()
    expect(resolverHorarioPassado('xx', agora)).toBeNull()
  })

  it('previsão: o dia mais perto de agora', () => {
    expect(mesmoInstante(resolverHorarioProximo('12:05', horaDemo('12:10'))!, horaDemo('12:05'))).toBe(true)
    expect(mesmoInstante(resolverHorarioProximo('00:10', horaDemo('23:50'))!, horaDemo('00:10', 1))).toBe(true)
    expect(mesmoInstante(resolverHorarioProximo('13:02', horaDemo('11:40'))!, horaDemo('13:02'))).toBe(true)
  })
})

describe('textos', () => {
  it('atraso: no horário até 5 min, + e −', () => {
    expect(textoDoAtraso(5)).toBe('no horário')
    expect(textoDoAtraso(-5)).toBe('no horário')
    expect(textoDoAtraso(17)).toBe('+17 min')
    expect(textoDoAtraso(75)).toBe('+1h15')
    expect(textoDoAtraso(-30)).toBe('−30 min')
  })

  it('situação, cronômetro e tempo restante', () => {
    expect(textoDaSituacao('em_parada', 'Monlevade')).toBe('Parados em Monlevade')
    expect(textoDaSituacao('parada_nao_planejada', null)).toBe('Parada não planejada')
    expect(textoDoCronometro({ faltaMin: 7, excedeuMin: 0 })).toBe('faltam 7 min')
    expect(textoDoCronometro({ faltaMin: 0, excedeuMin: 10 })).toBe('excedeu em 10 min')
    expect(textoDoTempoRestante(horaDemo('13:00'), horaDemo('11:55'))).toBe('1h05')
    expect(textoDoTempoRestante(horaDemo('13:00'), horaDemo('13:10'))).toBe('chegando')
  })

  it('origem da previsão só para recalibração', () => {
    const base = { instante: horaDemo('13:02'), atrasoMin: 62 }
    expect(textoDaOrigemDaPrevisao({ ...base, origem: 'recalibracao', recalibradoEm: horaDemo('11:40') })).toBe('Google Maps, informado às 11:40')
    expect(textoDaOrigemDaPrevisao({ ...base, origem: 'calculado' })).toBeNull()
  })
})

describe('timeline', () => {
  const calculo = calcularPlanoOriginal(PLANO_DEMO, horaDemo('06:00'))
  if (!calculo.ok) throw new Error('plano')
  const original = calculo.plano
  const base = (id: string, hora: string, seq: number) => ({ id, viagemId: 'v', horarioFato: horaDemo(hora), registradoEm: horaDemo(hora), sequencia: seq })
  const eventos = [
    criarEvento(base('c', '08:55', 3), { tipo: 'chegada', etapaId: ETAPA.monlevade }),
    criarEvento(base('i', '06:00', 1), { tipo: 'inicio' }),
    criarEvento(base('s', '06:47', 2), { tipo: 'saida', etapaId: ETAPA.origem }),
    criarEvento(base('t', '09:00', 4), { tipo: 'troca_local', etapaId: ETAPA.almoco, dados: { localId: LOCAL.restC } }),
  ]

  it('em ordem de horário, com atraso só em chegada e saída e correção só nelas', () => {
    const t = montarTimeline(PLANO_DEMO, original, eventos, horaDemo('09:05'))
    expect(t.map((x) => x.id)).toEqual(['i', 's', 'c', 't'])
    expect(t.map((x) => x.atraso)).toEqual([null, 17, 30, null])
    expect(t.map((x) => x.corrigivel)).toEqual([false, true, true, false])
    expect(t[1]!.titulo).toContain('Saímos de Origem')
    expect(t[3]!.titulo).toContain('Restaurante C')
  })
})

describe('motivos do PARAMOS', () => {
  it('inclui acidente na estrada e trânsito parado, e a timeline mostra o rótulo', () => {
    expect(MOTIVOS_DE_PARADA.map((m) => m.valor)).toEqual(
      expect.arrayContaining(['acidente', 'transito_parado']),
    )
    const calculo = calcularPlanoOriginal(PLANO_DEMO, horaDemo('06:00'))
    if (!calculo.ok) throw new Error('plano')
    const base = (id: string, hora: string, seq: number) => ({ id, viagemId: 'v', horarioFato: horaDemo(hora), registradoEm: horaDemo(hora), sequencia: seq })
    const eventos = [
      criarEvento(base('a', '09:00', 1), { tipo: 'parada_nao_planejada', etapaId: ETAPA.almoco, dados: { fase: 'inicio', motivo: 'acidente' } }),
      criarEvento(base('b', '10:00', 2), { tipo: 'parada_nao_planejada', etapaId: ETAPA.almoco, dados: { fase: 'inicio', motivo: 'transito_parado' } }),
    ]
    const t = montarTimeline(PLANO_DEMO, calculo.plano, eventos, horaDemo('11:00'))
    expect(t.map((x) => x.detalhe)).toEqual(['Acidente na estrada', 'Trânsito parado'])
  })
})
