// Fase 4: situação da viagem, cronômetro, travas de registro e correção, parada aberta.

import { describe, expect, it } from 'vitest'
import {
  limitesDoHorario,
  paradaAberta,
  resolverHoraPassada,
  rotuloHorario,
  situacaoDaViagem,
  validarCorrecao,
  validarRegistro,
} from '../registro'
import { congelar, ev, EVENTOS_CASO_1, EVENTOS_CASO_2, EVENTOS_CASO_3, h, PLANO } from './fixtures'
import { mesmoInstante } from '../tempo'

const original = congelar()
const inicio = ev.inicio(h('06:00'))

describe('situacaoDaViagem', () => {
  it('sem saída registrada: aguardando saída, na origem', () => {
    const s = situacaoDaViagem(PLANO, original, [inicio], h('06:10'))
    expect(s.situacao).toBe('aguardando_saida')
    expect(s.etapaAtualId).toBe('origem')
    expect(s.cronometro).toBeNull()
  })

  it('depois da saída: em viagem, com a próxima etapa', () => {
    const s = situacaoDaViagem(PLANO, original, EVENTOS_CASO_1, h('07:00'))
    expect(s.situacao).toBe('em_viagem')
    expect(s.proximaEtapaId).toBe('monlevade')
  })

  it('parado: cronômetro com planejado, decorrido e quanto falta', () => {
    const s = situacaoDaViagem(PLANO, original, EVENTOS_CASO_2, h('09:03'))
    expect(s.situacao).toBe('em_parada')
    expect(s.etapaAtualId).toBe('monlevade')
    expect(s.cronometro).toEqual({ etapaId: 'monlevade', planejadoMin: 15, decorridoMin: 8, faltaMin: 7, excedeuMin: 0 })
  })

  it('parado além do planejado: excedeu', () => {
    const s = situacaoDaViagem(PLANO, original, EVENTOS_CASO_2, h('09:20'))
    expect(s.cronometro).toMatchObject({ decorridoMin: 25, faltaMin: 0, excedeuMin: 10 })
  })

  it('PARAMOS sem VOLTAMOS: parada não planejada, contando até agora', () => {
    const eventos = [...EVENTOS_CASO_3, ev.parada('almoco', 'inicio', h('10:00'))]
    const s = situacaoDaViagem(PLANO, original, eventos, h('10:12'))
    expect(s.situacao).toBe('parada_nao_planejada')
    expect(s.paradaNaoPlanejada?.decorridoMin).toBe(12)
  })

  it('com VOLTAMOS volta a ser em viagem', () => {
    const eventos = [...EVENTOS_CASO_3, ev.parada('almoco', 'inicio', h('10:00')), ev.parada('almoco', 'fim', h('10:20'))]
    expect(situacaoDaViagem(PLANO, original, eventos, h('10:30')).situacao).toBe('em_viagem')
  })

  it('chegada real no destino: chegamos', () => {
    const eventos = [
      ...EVENTOS_CASO_3,
      ev.chegada('almoco', h('12:30')), ev.saida('almoco', h('13:30')),
      ev.chegada('cafe', h('16:30')), ev.saida('cafe', h('17:00')),
      ev.chegada('jantar', h('20:30')), ev.saida('jantar', h('21:20')),
      ev.chegada('destino', h('23:50')),
    ]
    expect(situacaoDaViagem(PLANO, original, eventos, h('23:51')).situacao).toBe('chegamos')
  })
})

describe('horários digitados', () => {
  it('vira a ocorrência mais recente que não seja depois de agora', () => {
    const hoje = resolverHoraPassada('08:10', h('09:00'))
    expect(mesmoInstante(hoje, h('08:10'))).toBe(true)
    const ontem = resolverHoraPassada('23:55', h('00:10', 1))
    expect(mesmoInstante(ontem, h('23:55'))).toBe(true)
  })

  it('mostra o dia quando não é hoje', () => {
    expect(rotuloHorario(h('23:55'), h('00:10', 1))).toBe('23:55 do dia 14')
    expect(rotuloHorario(h('00:05', 1), h('00:10', 1))).toBe('00:05')
  })
})

describe('travas de registro e correção', () => {
  it('chegada antes da saída anterior é recusada com a trava', () => {
    const r = validarRegistro(PLANO, original, EVENTOS_CASO_1, { tipo: 'chegada', etapaId: 'monlevade' }, h('06:40'), h('08:55'))
    expect(r).toEqual({ ok: false, motivo: 'A chegada não pode ser antes da saída anterior (06:47).' })
  })

  it('nada pode ser depois de agora', () => {
    const r = validarRegistro(PLANO, original, EVENTOS_CASO_1, { tipo: 'chegada', etapaId: 'monlevade' }, h('09:00'), h('08:55'))
    expect(r).toEqual({ ok: false, motivo: 'Não pode ser depois de agora (08:55).' })
  })

  it('só chegada na próxima etapa e só saída de onde estamos', () => {
    expect(validarRegistro(PLANO, original, EVENTOS_CASO_1, { tipo: 'chegada', etapaId: 'almoco' }, h('08:55'), h('08:55')).ok).toBe(false)
    expect(validarRegistro(PLANO, original, EVENTOS_CASO_1, { tipo: 'saida', etapaId: 'monlevade' }, h('08:55'), h('08:55')).ok).toBe(false)
    expect(validarRegistro(PLANO, original, EVENTOS_CASO_1, { tipo: 'chegada', etapaId: 'monlevade' }, h('08:55'), h('08:55')).ok).toBe(true)
    expect(validarRegistro(PLANO, original, EVENTOS_CASO_2, { tipo: 'saida', etapaId: 'monlevade' }, h('09:14'), h('09:14')).ok).toBe(true)
  })

  it('saída não antes da chegada da mesma etapa', () => {
    const r = validarRegistro(PLANO, original, EVENTOS_CASO_2, { tipo: 'saida', etapaId: 'monlevade' }, h('08:50'), h('09:14'))
    expect(r).toEqual({ ok: false, motivo: 'A saída não pode ser antes da chegada desta etapa (08:55).' })
  })

  it('correção: chegada não depois da saída da própria etapa (trava extra)', () => {
    const chegada = EVENTOS_CASO_3.find((e) => e.tipo === 'chegada')!
    const r = validarCorrecao(PLANO, EVENTOS_CASO_3, chegada.id, h('09:20'), h('10:00'))
    expect(r).toEqual({ ok: false, motivo: 'A chegada não pode ser depois da saída desta etapa (09:14).' })
    expect(validarCorrecao(PLANO, EVENTOS_CASO_3, chegada.id, h('09:00'), h('10:00')).ok).toBe(true)
  })

  it('correção: saída não depois da chegada da etapa seguinte (trava extra)', () => {
    const eventos = [...EVENTOS_CASO_3, ev.chegada('almoco', h('12:50'))]
    const saida = eventos.find((e) => e.tipo === 'saida' && e.etapaId === 'monlevade')!
    const r = validarCorrecao(PLANO, eventos, saida.id, h('13:00'), h('13:10'))
    expect(r).toEqual({ ok: false, motivo: 'A saída não pode ser depois da chegada da etapa seguinte (12:50).' })
  })

  it('correção: chegada não antes da saída anterior e só chegadas e saídas', () => {
    const chegada = EVENTOS_CASO_3.find((e) => e.tipo === 'chegada')!
    expect(validarCorrecao(PLANO, EVENTOS_CASO_3, chegada.id, h('06:30'), h('10:00'))).toEqual({
      ok: false,
      motivo: 'A chegada não pode ser antes da saída anterior (06:47).',
    })
    expect(validarCorrecao(PLANO, EVENTOS_CASO_3, inicio.id, h('06:00'), h('10:00')).ok).toBe(false)
  })

  it('limites mostram mínimo e máximo', () => {
    const l = limitesDoHorario(PLANO, EVENTOS_CASO_3, { tipo: 'chegada', etapaId: 'monlevade' }, h('10:00'))
    expect(mesmoInstante(l.minimo!.instante, h('06:47'))).toBe(true)
    expect(mesmoInstante(l.maximo.instante, h('09:14'))).toBe(true)
  })
})

describe('parada não planejada aberta (acréscimo A)', () => {
  const aberta = [...EVENTOS_CASO_3, ev.parada('almoco', 'inicio', h('10:00'))]

  it('detecta PARAMOS sem VOLTAMOS', () => {
    expect(paradaAberta(aberta, 'almoco')?.etapaId).toBe('almoco')
    expect(paradaAberta(aberta, 'cafe')).toBeNull()
    expect(paradaAberta([...aberta, ev.parada('almoco', 'fim', h('10:20'))], 'almoco')).toBeNull()
  })

  it('CHEGAMOS com a parada aberta é recusado: precisa informar a volta antes', () => {
    const r = validarRegistro(PLANO, original, aberta, { tipo: 'chegada', etapaId: 'almoco' }, h('12:30'), h('12:30'))
    expect(r.ok).toBe(false)
  })

  it('o VOLTAMOS informado não pode ser antes do PARAMOS nem depois de agora', () => {
    const fim = { tipo: 'parada_nao_planejada', etapaId: 'almoco', dados: { fase: 'fim' } } as const
    expect(validarRegistro(PLANO, original, aberta, fim, h('09:50'), h('12:30')).ok).toBe(false)
    expect(validarRegistro(PLANO, original, aberta, fim, h('12:40'), h('12:30')).ok).toBe(false)
    expect(validarRegistro(PLANO, original, aberta, fim, h('10:20'), h('12:30')).ok).toBe(true)
  })
})

describe('outros registros', () => {
  it('viagem concluída não aceita registros', () => {
    const d = { ...PLANO, viagem: { ...PLANO.viagem, status: 'concluida' as const } }
    expect(validarRegistro(d, original, EVENTOS_CASO_1, { tipo: 'imprevisto', dados: { categoria: 'clima' } }, h('07:00'), h('07:00')).ok).toBe(false)
  })

  it('PARAMOS só em viagem; VOLTAMOS só com parada aberta', () => {
    const inicioParada = { tipo: 'parada_nao_planejada', etapaId: 'monlevade', dados: { fase: 'inicio' } } as const
    const fimParada = { tipo: 'parada_nao_planejada', etapaId: 'monlevade', dados: { fase: 'fim' } } as const
    expect(validarRegistro(PLANO, original, EVENTOS_CASO_1, inicioParada, h('07:00'), h('07:00')).ok).toBe(true)
    expect(validarRegistro(PLANO, original, EVENTOS_CASO_2, inicioParada, h('09:00'), h('09:00')).ok).toBe(false)
    expect(validarRegistro(PLANO, original, EVENTOS_CASO_1, fimParada, h('07:00'), h('07:00')).ok).toBe(false)
  })

  it('pular etapa passa por validarPulo', () => {
    expect(validarRegistro(PLANO, original, EVENTOS_CASO_3, { tipo: 'pular_etapa', etapaId: 'cafe' }, h('10:00'), h('10:00')).ok).toBe(true)
    expect(validarRegistro(PLANO, original, EVENTOS_CASO_3, { tipo: 'pular_etapa', etapaId: 'monlevade' }, h('10:00'), h('10:00')).ok).toBe(false)
  })

  it('recalibração no passado é recusada (caso 7, via registro)', () => {
    const r = validarRegistro(PLANO, original, EVENTOS_CASO_3, { tipo: 'recalibracao', etapaId: 'almoco', dados: { horario: h('12:05') } }, h('12:10'), h('12:10'))
    expect(r.ok).toBe(false)
  })
})
