import { describe, expect, it } from 'vitest'
import { instante } from '../../../core/tempo'
import { linkTelefone, textoDaConsulta, textoIdade, rotuloDaClasse, textoDaMargem, textoDoAvisoDaAlternativa, textoDoImpacto } from '../alternativas'

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

  it('idade da consulta', () => {
    expect(textoIdade(0)).toBe('agora')
    expect(textoIdade(8)).toBe('há 8 min')
    expect(textoIdade(65)).toBe('há 1h05')
  })

  it('origem da alternativa consultada', () => {
    const consultadoEm = instante('2026-11-14T08:30:00-03:00')
    expect(textoDaConsulta({ consultadoEm, idadeMin: 8, situacao: 'vigente' })).toBe('Google Maps, informado às 08:30 · há 8 min')
    expect(textoDaConsulta({ consultadoEm, idadeMin: 45, situacao: 'antiga' })).toBe(
      'Consulta antiga (informado às 08:30 · há 45 min): não está valendo',
    )
  })
})
