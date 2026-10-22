// Ajuste do PARAMOS: tempo previsto e "onde" (paradas por escolha). Casos P1 a P12 da especificação.

import { describe, expect, it } from 'vitest'
import { calcularEstado } from '../previsao'
import { paradaAberta, situacaoDaViagem, validarRegistro } from '../registro'
import { congelar, esperarHorario, etapaDe, ev, EVENTOS_CASO_3, h, PLANO } from './fixtures'
import type { Evento } from '../tipos'

const original = congelar()
const paramos = (extra: { tempoPrevistoMin?: number; onde?: string } = {}) =>
  ev.parada('almoco', 'inicio', h('10:00'), { motivo: 'cafe', ...extra })
const base = (...mais: Evento[]) => [...EVENTOS_CASO_3, ...mais]

function previsao(eventos: Evento[], agora: string) {
  const estado = calcularEstado(PLANO, original, eventos, h(agora))
  return {
    almoco: etapaDe(estado, 'almoco').chegada?.instante,
    destino: estado.chegadaDestino?.instante,
    atraso: estado.atrasoDestinoMin,
  }
}

describe('P1: sem tempo previsto, nada muda', () => {
  it('PARAMOS 10:00, relógio 10:20 → almoço 12:54, destino 00:24, +54', () => {
    const p = previsao(base(ev.parada('almoco', 'inicio', h('10:00'))), '10:20')
    esperarHorario(p.almoco, h('12:54'))
    esperarHorario(p.destino, h('00:24', 1))
    expect(p.atraso).toBe(54)
  })
})

describe('P2 a P5: parada aberta com tempo previsto de 20 min', () => {
  const eventos = () => base(paramos({ tempoPrevistoMin: 20 }))

  it('P2: ao parar, a previsão já mostra o impacto', () => {
    const p = previsao(eventos(), '10:00')
    esperarHorario(p.almoco, h('12:54'))
    esperarHorario(p.destino, h('00:24', 1))
    expect(p.atraso).toBe(54)
  })

  it('P3: dentro do previsto a previsão não cresce; cartão "faltam 8 min"', () => {
    esperarHorario(previsao(eventos(), '10:12').almoco, h('12:54'))
    const s = situacaoDaViagem(PLANO, original, eventos(), h('10:12'))
    expect(s.paradaNaoPlanejada).toMatchObject({ decorridoMin: 12, tempoPrevistoMin: 20, faltaMin: 8, excedeuMin: 0 })
  })

  it('P4: no minuto exato do previsto, faltam 0 min', () => {
    esperarHorario(previsao(eventos(), '10:20').almoco, h('12:54'))
    const s = situacaoDaViagem(PLANO, original, eventos(), h('10:20'))
    expect(s.paradaNaoPlanejada).toMatchObject({ faltaMin: 0, excedeuMin: 0 })
  })

  it('P5: estourando, a previsão acompanha o relógio; cartão "excedeu em 15 min"', () => {
    const p = previsao(eventos(), '10:35')
    esperarHorario(p.almoco, h('13:09'))
    esperarHorario(p.destino, h('00:39', 1))
    expect(p.atraso).toBe(69)
    const s = situacaoDaViagem(PLANO, original, eventos(), h('10:35'))
    expect(s.paradaNaoPlanejada).toMatchObject({ faltaMin: 0, excedeuMin: 15 })
  })

  it('sem tempo previsto, o cartão não traz falta nem excesso', () => {
    const s = situacaoDaViagem(PLANO, original, base(ev.parada('almoco', 'inicio', h('10:00'))), h('10:12'))
    expect(s.paradaNaoPlanejada?.tempoPrevistoMin).toBeUndefined()
    expect(s.paradaNaoPlanejada?.faltaMin).toBeUndefined()
    expect(s.paradaNaoPlanejada?.excedeuMin).toBeUndefined()
  })
})

describe('P6 e P7: ao fechar vale a duração real', () => {
  it('P6: VOLTAMOS 10:14 (antes do previsto) → almoço 12:48, destino 00:18, +48', () => {
    const p = previsao(base(paramos({ tempoPrevistoMin: 20 }), ev.parada('almoco', 'fim', h('10:14'))), '10:30')
    esperarHorario(p.almoco, h('12:48'))
    esperarHorario(p.destino, h('00:18', 1))
    expect(p.atraso).toBe(48)
  })

  it('P7: VOLTAMOS 10:31 (depois do previsto) → almoço 13:05', () => {
    const p = previsao(base(paramos({ tempoPrevistoMin: 20 }), ev.parada('almoco', 'fim', h('10:31'))), '10:40')
    esperarHorario(p.almoco, h('13:05'))
  })
})

describe('P8: editar o tempo previsto com a parada aberta', () => {
  it('de 20 para 40 aos 10:12 → 13:14; depois apagado → volta a acompanhar o relógio (12:46)', () => {
    const com20 = base(paramos({ tempoPrevistoMin: 20 }))
    const com40 = [...com20, ev.parada('almoco', 'previsao', h('10:12'), { tempoPrevistoMin: 40 })]
    esperarHorario(previsao(com40, '10:12').almoco, h('13:14'))
    const apagado = [...com40, ev.parada('almoco', 'previsao', h('10:12'))]
    esperarHorario(previsao(apagado, '10:12').almoco, h('12:46'))
  })

  it('o evento previsao leva o estado completo: "onde" e tempo previsto', () => {
    const eventos = base(paramos({ tempoPrevistoMin: 20, onde: 'Padaria Tal' }), ev.parada('almoco', 'previsao', h('10:05'), { tempoPrevistoMin: 30 }))
    expect(paradaAberta(eventos, 'almoco')).toMatchObject({ motivo: 'cafe', tempoPrevistoMin: 30 })
    expect(paradaAberta(eventos, 'almoco')?.onde).toBeUndefined()
    const comOnde = [...eventos, ev.parada('almoco', 'previsao', h('10:05'), { onde: 'Padaria Tal' })]
    expect(paradaAberta(comOnde, 'almoco')).toMatchObject({ onde: 'Padaria Tal' })
    expect(paradaAberta(comOnde, 'almoco')?.tempoPrevistoMin).toBeUndefined()
  })

  it('um PARAMOS novo começa do zero: não herda o tempo da parada anterior', () => {
    const eventos = base(
      paramos({ tempoPrevistoMin: 20, onde: 'Padaria Tal' }),
      ev.parada('almoco', 'fim', h('10:14')),
      ev.parada('almoco', 'inicio', h('10:30')),
    )
    expect(paradaAberta(eventos, 'almoco')?.tempoPrevistoMin).toBeUndefined()
    expect(paradaAberta(eventos, 'almoco')?.onde).toBeUndefined()
  })
})

describe('P9: várias paradas no mesmo trecho', () => {
  it('10 min fechada + aberta com T=15 → soma 25 min: almoço 12:59', () => {
    const eventos = base(
      ev.parada('almoco', 'inicio', h('09:30')),
      ev.parada('almoco', 'fim', h('09:40')),
      ev.parada('almoco', 'inicio', h('10:00'), { tempoPrevistoMin: 15 }),
    )
    esperarHorario(previsao(eventos, '10:00').almoco, h('12:59'))
  })
})

describe('P10: recalibração', () => {
  it('só conta a parada iniciada depois dela; com tempo previsto, conta o tempo previsto', () => {
    const recal = ev.recalibracao('almoco', h('13:00'), h('09:50'))
    const antesDaRecal = base(ev.parada('almoco', 'inicio', h('09:30'), { tempoPrevistoMin: 60 }), recal)
    esperarHorario(previsao(antesDaRecal, '10:00').almoco, h('13:00'))
    const depoisDaRecal = base(recal, ev.parada('almoco', 'inicio', h('10:00'), { tempoPrevistoMin: 20 }))
    esperarHorario(previsao(depoisDaRecal, '10:00').almoco, h('13:20'))
  })
})

describe('P11: validação do registro', () => {
  const aberta = base(paramos())
  const reg = (dados: Extract<Evento, { tipo: 'parada_nao_planejada' }>['dados'], eventos = aberta, quando = '10:10') =>
    validarRegistro(PLANO, original, eventos, { tipo: 'parada_nao_planejada', etapaId: 'almoco', dados }, h(quando), h(quando))

  it('aceita a previsão com a parada aberta', () => {
    expect(reg({ fase: 'previsao', tempoPrevistoMin: 20, onde: 'Padaria Tal' }).ok).toBe(true)
    expect(reg({ fase: 'previsao' }).ok).toBe(true)
  })

  it('recusa previsão com a parada fechada', () => {
    const fechada = base(paramos(), ev.parada('almoco', 'fim', h('10:20')))
    expect(reg({ fase: 'previsao', tempoPrevistoMin: 20 }, fechada, '10:30').ok).toBe(false)
  })

  it('recusa previsão antes do PARAMOS', () => {
    expect(reg({ fase: 'previsao', tempoPrevistoMin: 20 }, aberta, '09:50').ok).toBe(false)
  })

  it.each([0, -5, 601, 12.5, Number.NaN])('recusa tempo previsto %s (no PARAMOS e na previsão)', (t) => {
    expect(reg({ fase: 'previsao', tempoPrevistoMin: t }).ok).toBe(false)
    const livre = validarRegistro(
      PLANO, original, EVENTOS_CASO_3,
      { tipo: 'parada_nao_planejada', etapaId: 'almoco', dados: { fase: 'inicio', tempoPrevistoMin: t } },
      h('10:00'), h('10:00'),
    )
    expect(livre.ok).toBe(false)
  })

  it('aceita os limites 1 e 600', () => {
    expect(reg({ fase: 'previsao', tempoPrevistoMin: 1 }).ok).toBe(true)
    expect(reg({ fase: 'previsao', tempoPrevistoMin: 600 }).ok).toBe(true)
  })

  it('recusa "onde" com mais de 60 caracteres ou só espaços; aceita 60', () => {
    expect(reg({ fase: 'previsao', onde: 'x'.repeat(61) }).ok).toBe(false)
    expect(reg({ fase: 'previsao', onde: '   ' }).ok).toBe(false)
    expect(reg({ fase: 'previsao', onde: 'x'.repeat(60) }).ok).toBe(true)
  })

  it('o PARAMOS aceita motivo "cafe", "onde" e tempo previsto', () => {
    const r = validarRegistro(
      PLANO, original, EVENTOS_CASO_3,
      { tipo: 'parada_nao_planejada', etapaId: 'almoco', dados: { fase: 'inicio', motivo: 'cafe', onde: 'Padaria Tal', tempoPrevistoMin: 20 } },
      h('10:00'), h('10:00'),
    )
    expect(r.ok).toBe(true)
  })

  it('o VOLTAMOS não leva "onde" nem tempo previsto', () => {
    expect(reg({ fase: 'fim', tempoPrevistoMin: 20 }).ok).toBe(false)
  })
})

describe('P12: plano original intacto', () => {
  it('nenhum evento da parada altera o plano original', () => {
    const eventos = base(paramos({ tempoPrevistoMin: 20, onde: 'Padaria Tal' }), ev.parada('almoco', 'fim', h('10:31')))
    calcularEstado(PLANO, original, eventos, h('10:40'))
    expect(congelar()).toEqual(original)
  })
})
