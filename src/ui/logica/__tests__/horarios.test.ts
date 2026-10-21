import { describe, expect, it } from 'vitest'
import { instante } from '../../../core/tempo'
import type { Etapa } from '../../../core/tipos'
import { dataParaInstante, diasDepois, formatarData, formatarHora, referenciaAnterior, resolverHora, resolverJanela } from '../horarios'

const i = instante

describe('horários dos formulários', () => {
  it('formata hora e data no fuso -03:00', () => {
    expect(formatarHora(i('2026-11-14T06:47:00-03:00'))).toBe('06:47')
    expect(formatarData(i('2026-11-14T06:47:00-03:00'))).toBe('2026-11-14')
    expect(formatarHora(i('2026-11-14T09:05:00Z'))).toBe('06:05')
  })

  it('data do campo vira meia-noite com fuso', () => {
    expect(dataParaInstante('2026-11-14')).toBe('2026-11-14T00:00:00-03:00')
  })

  it('hora maior ou igual à referência fica no mesmo dia, sem "+1 dia"', () => {
    const ref = i('2026-11-14T08:40:00-03:00')
    expect(resolverHora('12:00', ref)).toEqual({ instante: '2026-11-14T12:00:00-03:00', viraDia: false })
    expect(resolverHora('08:40', ref).viraDia).toBe(false)
  })

  it('hora menor que a referência vai para o dia seguinte e pede confirmação', () => {
    const ref = i('2026-11-14T21:20:00-03:00')
    expect(resolverHora('00:10', ref)).toEqual({ instante: '2026-11-15T00:10:00-03:00', viraDia: true })
    expect(diasDepois(resolverHora('00:10', ref).instante, ref)).toBe(1)
  })

  it('janela comum fica no dia da chegada', () => {
    const j = resolverJanela('11:30', '14:00', i('2026-11-14T12:00:00-03:00'), true)
    expect(j).toEqual({ inicio: '2026-11-14T11:30:00-03:00', fim: '2026-11-14T14:00:00-03:00', atravessaMeiaNoite: false })
  })

  it('janela que atravessa a meia-noite, chegada antes da meia-noite: início no dia da chegada, fim no seguinte', () => {
    const j = resolverJanela('23:00', '01:00', i('2026-11-14T23:30:00-03:00'), true)
    expect(j).toEqual({ inicio: '2026-11-14T23:00:00-03:00', fim: '2026-11-15T01:00:00-03:00', atravessaMeiaNoite: true })
  })

  it('janela que atravessa a meia-noite, chegada depois da meia-noite (00:30 do dia 15): início na véspera, fim no dia da chegada', () => {
    const j = resolverJanela('23:00', '01:00', i('2026-11-15T00:30:00-03:00'), true)
    expect(j).toEqual({ inicio: '2026-11-14T23:00:00-03:00', fim: '2026-11-15T01:00:00-03:00', atravessaMeiaNoite: true })
  })

  it('chegada na mesma hora do fim ou depois dele não usa a véspera', () => {
    const j = resolverJanela('23:00', '01:00', i('2026-11-15T01:00:00-03:00'), true)
    expect(j.inicio).toBe('2026-11-15T23:00:00-03:00')
    expect(resolverJanela('23:00', '01:00', i('2026-11-15T12:00:00-03:00'), true).inicio).toBe('2026-11-15T23:00:00-03:00')
  })

  it('sem chegada, a âncora é a referência anterior: início no dia dela e fim no seguinte', () => {
    const j = resolverJanela('23:00', '01:00', i('2026-11-14T00:10:00-03:00'), false)
    expect(j).toEqual({ inicio: '2026-11-14T23:00:00-03:00', fim: '2026-11-15T01:00:00-03:00', atravessaMeiaNoite: true })
  })

  it('referência anterior: saída do roteiro da etapa anterior mais próxima com horário', () => {
    const base = { viagemId: 'v', localId: null, alternativas: [] as string[] }
    const etapas: Etapa[] = [
      { ...base, id: 'o', ordem: 1, tipo: 'origem', permanenciaMin: 0, chegadaRoteiro: i('2026-11-14T06:30:00-03:00') },
      { ...base, id: 'a', ordem: 2, tipo: 'obrigatoria', permanenciaMin: 15, chegadaRoteiro: i('2026-11-14T08:25:00-03:00') },
      { ...base, id: 'b', ordem: 3, tipo: 'flexivel', permanenciaMin: 30 },
      { ...base, id: 'c', ordem: 4, tipo: 'destino', permanenciaMin: 0 },
    ]
    const saida = i('2026-11-14T00:00:00-03:00')
    expect(referenciaAnterior(etapas, 1, saida)).toBe('2026-11-14T06:30:00-03:00')
    expect(referenciaAnterior(etapas, 3, saida)).toBe('2026-11-14T08:40:00-03:00')
    expect(referenciaAnterior(etapas, 0, saida)).toBe('2026-11-14T00:00:00-03:00')
  })
})
