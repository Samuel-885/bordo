import { describe, expect, it } from 'vitest'
import { instante } from '../../../core/tempo'
import { ehNoite, ehPreferenciaTema, temaEfetivo } from '../tema'

const as = (hhmm: string) => instante(`2026-11-14T${hhmm}:00-03:00`)

describe('modo noite', () => {
  it('automático: noite das 18:00 às 06:00, dia no resto', () => {
    expect(temaEfetivo('automatico', as('05:59'))).toBe('escuro')
    expect(temaEfetivo('automatico', as('06:00'))).toBe('claro')
    expect(temaEfetivo('automatico', as('12:00'))).toBe('claro')
    expect(temaEfetivo('automatico', as('17:59'))).toBe('claro')
    expect(temaEfetivo('automatico', as('18:00'))).toBe('escuro')
    expect(temaEfetivo('automatico', as('23:59'))).toBe('escuro')
    expect(temaEfetivo('automatico', as('00:00'))).toBe('escuro')
  })

  it('a escolha manual vale em qualquer hora', () => {
    expect(temaEfetivo('claro', as('23:00'))).toBe('claro')
    expect(temaEfetivo('escuro', as('12:00'))).toBe('escuro')
  })

  it('segue o horário do instante, não o do aparelho', () => {
    expect(ehNoite(as('20:30'))).toBe(true)
    expect(ehNoite(as('08:00'))).toBe(false)
  })

  it('só aceita as três preferências', () => {
    expect(['automatico', 'claro', 'escuro'].every(ehPreferenciaTema)).toBe(true)
    expect(ehPreferenciaTema('noite')).toBe(false)
    expect(ehPreferenciaTema(null)).toBe(false)
  })
})
