import { describe, expect, it } from 'vitest'
import type { DadosPlano } from '../tipos'
import { avaliarAlternativas } from '../viabilidade'
import { congelar, esperarHorario, ev, h, PLANO } from './fixtures'

// Restaurante A é o do roteiro (3h20 desde Monlevade). B e C têm trechos manuais.
const plano: DadosPlano = {
  ...PLANO,
  locais: PLANO.locais.map((l) => {
    if (l.id === 'l-rest-a') return { ...l, abre: '11:00', fecha: '14:00' }
    if (l.id === 'l-rest-b') return { ...l, abre: '11:00', fecha: '15:00' }
    if (l.id === 'l-rest-c') return { ...l, abre: '11:00', fecha: '16:30' }
    return l
  }),
  trechos: [
    { etapaOrigemId: 'monlevade', localOrigemId: 'l-monlevade', etapaDestinoId: 'almoco', localDestinoId: 'l-rest-b', duracaoMin: 220, fonte: 'manual' },
    { etapaOrigemId: 'monlevade', localOrigemId: 'l-monlevade', etapaDestinoId: 'almoco', localDestinoId: 'l-rest-c', duracaoMin: 250, fonte: 'manual' },
    { etapaOrigemId: 'almoco', localOrigemId: 'l-rest-b', etapaDestinoId: 'cafe', localDestinoId: 'l-cafe', duracaoMin: 180, fonte: 'manual' },
    { etapaOrigemId: 'almoco', localOrigemId: 'l-rest-c', etapaDestinoId: 'cafe', localDestinoId: 'l-cafe', duracaoMin: 180, fonte: 'manual' },
  ],
}

describe('caso 9: viabilidade', () => {
  it('chegadas 14:15, 14:35, 15:05; fechamentos 14:00, 15:00, 16:30; 60 min → A inviável, B pouca margem, C viável (25 min)', () => {
    const eventos = [
      ev.inicio(h('06:00')),
      ev.saida('origem', h('06:30')),
      ev.chegada('monlevade', h('08:25')),
      ev.saida('monlevade', h('10:55')),
    ]
    const lista = avaliarAlternativas(plano, congelar(plano), eventos, h('10:55'), 'almoco')
    const por = (id: string) => lista.find((a) => a.localId === id)!

    esperarHorario(por('l-rest-a').chegada, h('14:15'))
    esperarHorario(por('l-rest-b').chegada, h('14:35'))
    esperarHorario(por('l-rest-c').chegada, h('15:05'))

    expect(por('l-rest-a').classe).toBe('inviavel')
    expect(por('l-rest-b').classe).toBe('pouca_margem')
    expect(por('l-rest-c').classe).toBe('viavel')
    expect(por('l-rest-c').margemMin).toBe(25)

    expect(lista.map((a) => a.localId)).toEqual(['l-rest-c', 'l-rest-b', 'l-rest-a'])
    expect(por('l-rest-a').escolhida).toBe(true)
    expect(por('l-rest-b').impactoDestinoMin).toBe(20)
    expect(por('l-rest-c').impactoDestinoMin).toBe(50)
  })
})
