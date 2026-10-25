import { describe, expect, it } from 'vitest'
import { instante } from '../../../core/tempo'
import { dataBr, exigeConfirmacaoForte, rotuloDaViagem } from '../viagens'

const saida = instante('2026-11-14T06:30:00-03:00')

describe('rótulo da viagem', () => {
  it('nome, data e status', () => {
    expect(dataBr(saida)).toBe('14/11/2026')
    expect(rotuloDaViagem({ nome: 'Teste', dataSaida: saida, status: 'concluida' })).toBe('Teste · 14/11/2026 · Concluída')
    expect(rotuloDaViagem({ nome: '', dataSaida: saida, status: 'planejando' })).toBe('Sem nome · 14/11/2026 · Planejando')
  })

  it('só a viagem em planejamento dispensa a confirmação forte', () => {
    expect(exigeConfirmacaoForte({ status: 'planejando' })).toBe(false)
    expect(exigeConfirmacaoForte({ status: 'em_andamento' })).toBe(true)
    expect(exigeConfirmacaoForte({ status: 'concluida' })).toBe(true)
  })
})
