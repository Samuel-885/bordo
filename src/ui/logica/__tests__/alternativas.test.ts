import { describe, expect, it } from 'vitest'
import { linkTelefone, rotuloDaClasse, textoDaMargem, textoDoAvisoDaAlternativa, textoDoImpacto } from '../alternativas'

describe('textos das alternativas', () => {
  it('classes em português', () => {
    expect(rotuloDaClasse('viavel')).toBe('Viável')
    expect(rotuloDaClasse('pouca_margem')).toBe('Pouca margem')
    expect(rotuloDaClasse('inviavel')).toBe('Inviável')
    expect(rotuloDaClasse('sem_horario')).toBe('Sem horário')
    expect(rotuloDaClasse('sem_tempo')).toBe('Sem tempo')
  })

  it('impacto no destino', () => {
    expect(textoDoImpacto(20)).toBe('+20 min')
    expect(textoDoImpacto(-5)).toBe('−5 min')
    expect(textoDoImpacto(65)).toBe('+1h05')
    expect(textoDoImpacto(0)).toBe('sem mudança')
  })

  it('margem, inclusive a negativa', () => {
    expect(textoDaMargem(25)).toBe('25 min de margem')
    expect(textoDaMargem(-5)).toBe('faltam 5 min')
  })

  it('avisos', () => {
    expect(textoDoAvisoDaAlternativa('onibus_para_nao_sei')).toBe('Não sei se o ônibus para')
  })

  it('link tel: só com dígitos', () => {
    expect(linkTelefone('(31) 3333-4444')).toBe('tel:3133334444')
    expect(linkTelefone('+55 31 99999-0000')).toBe('tel:+5531999990000')
    expect(linkTelefone('  ')).toBeNull()
    expect(linkTelefone(undefined)).toBeNull()
  })
})
