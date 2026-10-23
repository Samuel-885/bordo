import { describe, expect, it } from 'vitest'
import type { Etapa, Local } from '../../../core/tipos'
import { usosDoLocal } from '../usoDoLocal'

const local = (id: string, nome: string): Local => ({ id, nome, cidade: 'Cidade X', tipo: 'restaurante', onibusPara: 'nao_sei' })
const etapa = (id: string, localId: string | null, alternativas: string[]): Etapa =>
  ({ id, viagemId: 'v1', ordem: 1, tipo: 'flexivel', localId, alternativas, motivo: 'Almoço', permanenciaMin: 60 }) as unknown as Etapa

describe('uso de um local', () => {
  const locais = [local('a', 'Restaurante A'), local('b', 'Restaurante B')]

  it('diz a viagem, a etapa e o papel do local', () => {
    const usos = usosDoLocal('b', [
      { viagem: { nome: 'Ida fictícia' }, etapas: [etapa('e1', 'a', ['b'])], locais },
      { viagem: { nome: 'Volta fictícia' }, etapas: [etapa('e2', 'b', [])], locais },
    ])
    expect(usos).toHaveLength(2)
    expect(usos[0]).toContain('Ida fictícia')
    expect(usos[0]).toContain('(alternativa)')
    expect(usos[1]).toContain('Volta fictícia')
    expect(usos[1]).toContain('(preferido)')
  })

  it('sem uso, lista vazia', () => {
    expect(usosDoLocal('zzz', [{ viagem: { nome: 'Ida' }, etapas: [etapa('e1', 'a', ['b'])], locais }])).toEqual([])
  })
})
