import { describe, expect, it } from 'vitest'
import { ETAPAS as ETAPAS_TESTE, LOCAIS as LOCAIS_TESTE, PASSAGEIROS as PASSAGEIROS_TESTE } from '../../core/__tests__/fixtures'
import { calcularPlanoOriginal } from '../../core/previsao'
import { esperadosNaSaida } from '../../core/passageiros'
import { ESPACO_DEMO, ETAPA, horaDemo, PASSAGEIROS_DEMO, PLANO_DEMO } from '../dados'
import { esperarHorario } from './ajudas'

describe('dados da demonstração', () => {
  it('têm 38 passageiros fictícios: 35 em Ipatinga e 3 em Monlevade', () => {
    expect(PASSAGEIROS_DEMO).toHaveLength(38)
    expect(PASSAGEIROS_DEMO.filter((p) => p.etapaEmbarqueId === ETAPA.origem)).toHaveLength(35)
    expect(PASSAGEIROS_DEMO.filter((p) => p.etapaEmbarqueId === ETAPA.monlevade)).toHaveLength(3)
    expect(PASSAGEIROS_DEMO.every((p) => p.nome.startsWith('Passageiro fictício'))).toBe(true)
    expect(esperadosNaSaida(ETAPA.origem, PLANO_DEMO.etapas, PASSAGEIROS_DEMO, [])).toBe(35)
    expect(esperadosNaSaida(ETAPA.monlevade, PLANO_DEMO.etapas, PASSAGEIROS_DEMO, [])).toBe(38)
  })

  it('têm todos os ids com o prefixo da demonstração', () => {
    const ids = [
      PLANO_DEMO.viagem.id,
      ...PLANO_DEMO.etapas.flatMap((e) => [e.id, e.viagemId, e.localId ?? '', ...e.alternativas]),
      ...PLANO_DEMO.locais.map((l) => l.id),
      ...PLANO_DEMO.trechos.flatMap((t) => [t.etapaOrigemId, t.localOrigemId, t.etapaDestinoId, t.localDestinoId]),
      ...PASSAGEIROS_DEMO.flatMap((p) => [p.id, p.etapaEmbarqueId]),
    ]
    expect(ids.filter((id) => !id.startsWith(ESPACO_DEMO))).toEqual([])
  })

  it('não compartilham ids nem objetos com as fixtures de teste', () => {
    const demo = new Set([
      ...PLANO_DEMO.etapas.map((e) => e.id),
      ...PLANO_DEMO.locais.map((l) => l.id),
      ...PASSAGEIROS_DEMO.map((p) => p.id),
    ])
    const teste = [...ETAPAS_TESTE.map((e) => e.id), ...LOCAIS_TESTE.map((l) => l.id), ...PASSAGEIROS_TESTE.map((p) => p.id)]
    expect(teste.filter((id) => demo.has(id))).toEqual([])
    expect(PLANO_DEMO.etapas.some((e) => ETAPAS_TESTE.includes(e))).toBe(false)
  })

  it('têm plano original calculável, igual ao roteiro', () => {
    const r = calcularPlanoOriginal(PLANO_DEMO, horaDemo('06:00'))
    if (!r.ok) throw new Error(JSON.stringify(r.bloqueios))
    const por = (id: string) => r.plano.etapas.find((e) => e.etapaId === id)!
    esperarHorario(por(ETAPA.origem).saida, horaDemo('06:30'))
    esperarHorario(por(ETAPA.monlevade).chegada, horaDemo('08:25'))
    esperarHorario(por(ETAPA.almoco).chegada, horaDemo('12:00'))
    esperarHorario(por(ETAPA.cafe).chegada, horaDemo('16:00'))
    esperarHorario(por(ETAPA.jantar).chegada, horaDemo('20:30'))
    esperarHorario(por(ETAPA.destino).chegada, horaDemo('23:30'))
  })
})
