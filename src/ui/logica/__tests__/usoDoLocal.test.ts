import { describe, expect, it } from 'vitest'
import type { Etapa, Local } from '../../../core/tipos'
import { instante } from '../../../core/tempo'
import { usosDoLocal } from '../usoDoLocal'

const local = (id: string, nome: string): Local => ({ id, nome, cidade: 'Cidade X', tipo: 'restaurante', onibusPara: 'nao_sei' })
const etapa = (id: string, localId: string | null, alternativas: string[]): Etapa =>
  ({ id, viagemId: 'v1', ordem: 1, tipo: 'flexivel', localId, alternativas, motivo: 'Almoço', permanenciaMin: 60 }) as unknown as Etapa

describe('uso de um local', () => {
  const locais = [local('a', 'Restaurante A'), local('b', 'Restaurante B')]

  it('diz a viagem, a etapa e o papel do local', () => {
    const usos = usosDoLocal('b', [
      { viagem: { nome: 'Ida fictícia', dataSaida: instante('2026-11-14T06:30:00-03:00'), status: 'concluida' as const }, etapas: [etapa('e1', 'a', ['b'])], locais },
      { viagem: { nome: 'Volta fictícia', dataSaida: instante('2026-11-15T06:30:00-03:00'), status: 'planejando' as const }, etapas: [etapa('e2', 'b', [])], locais },
    ])
    expect(usos).toHaveLength(2)
    expect(usos[0]).toContain('Ida fictícia')
    expect(usos[0]).toContain('(alternativa)')
    expect(usos[1]).toContain('Volta fictícia')
    expect(usos[1]).toContain('(preferido)')
  })

  it('duas viagens com o mesmo nome se distinguem pela data e pelo status', () => {
    const usos = usosDoLocal('a', [
      { viagem: { nome: 'Teste', dataSaida: instante('2026-11-14T06:30:00-03:00'), status: 'concluida' as const }, etapas: [etapa('e1', 'a', [])], locais },
      { viagem: { nome: 'Teste', dataSaida: instante('2026-11-20T06:30:00-03:00'), status: 'em_andamento' as const }, etapas: [etapa('e2', 'a', [])], locais },
    ])
    expect(usos).toEqual([
      expect.stringMatching(/^Teste \(14\/11\/2026, Concluída\): .*\(preferido\)$/),
      expect.stringMatching(/^Teste \(20\/11\/2026, Em andamento\): .*\(preferido\)$/),
    ])
  })

  it('sem uso, lista vazia', () => {
    expect(usosDoLocal('zzz', [{ viagem: { nome: 'Ida', dataSaida: instante('2026-11-14T06:30:00-03:00'), status: 'planejando' as const }, etapas: [etapa('e1', 'a', ['b'])], locais }])).toEqual([])
  })
})
