import { describe, expect, it } from 'vitest'
import { contagemRapida } from '../passageiros'

describe('caso 14: contagem rápida', () => {
  it('38 esperados, digita 37 → nada confirmado, aviso de diferença de 1', () => {
    expect(contagemRapida(38, 37)).toEqual({ completa: false, diferenca: 1, sentido: 'faltando' })
  })

  it('número igual aos esperados → completa por contagem', () => {
    expect(contagemRapida(38, 38)).toEqual({ completa: true, resultado: 'completa_por_contagem' })
  })
})
