// Relógio real e simulado. O simulado nunca vaza para a viagem real.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { avancarSimulado, agora, definirSimulado, simuladoAtivo, usarRelogioReal, usarRelogioSimulado } from '../relogio'
import { diferencaMin, instante } from '../tempo'

const INICIO = instante('2026-11-14T06:30:00-03:00')

afterEach(() => {
  usarRelogioReal()
  vi.useRealTimers()
})

describe('relógio real (padrão)', () => {
  it('começa no relógio real, sem simulado ligado', () => {
    expect(simuladoAtivo()).toBe(false)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-14T09:00:30Z'))
    expect(agora()).toBe('2026-11-14T06:00:30-03:00')
  })

  it('um reinício do módulo volta ao relógio real', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-14T12:00:00Z'))
    usarRelogioSimulado(INICIO)
    expect(simuladoAtivo()).toBe(true)
    vi.resetModules()
    const novo = await import('../relogio')
    expect(novo.simuladoAtivo()).toBe(false)
    expect(novo.agora()).toBe('2026-11-14T09:00:00-03:00')
  })

  it('avançar e definir exigem o simulado ligado', () => {
    expect(() => avancarSimulado(5)).toThrow()
    expect(() => definirSimulado(INICIO)).toThrow()
    expect(simuladoAtivo()).toBe(false)
  })
})

describe('relógio simulado', () => {
  it('fica parado no horário em que foi ligado, mesmo com o tempo real passando', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    usarRelogioSimulado(INICIO)
    expect(simuladoAtivo()).toBe(true)
    expect(agora()).toBe(INICIO)
    vi.advanceTimersByTime(3 * 60 * 60_000)
    expect(agora()).toBe(INICIO)
  })

  it('avança 5, 15 e 60 minutos', () => {
    usarRelogioSimulado(INICIO)
    avancarSimulado(5)
    expect(diferencaMin(agora(), INICIO)).toBe(5)
    avancarSimulado(15)
    expect(diferencaMin(agora(), INICIO)).toBe(20)
    avancarSimulado(60)
    expect(diferencaMin(agora(), INICIO)).toBe(80)
    expect(agora()).toBe('2026-11-14T07:50:00-03:00')
  })

  it('define um horário, para a frente ou para trás, inclusive em outro dia', () => {
    usarRelogioSimulado(INICIO)
    definirSimulado(instante('2026-11-14T23:59:00-03:00'))
    avancarSimulado(5)
    expect(agora()).toBe('2026-11-15T00:04:00-03:00')
    definirSimulado(INICIO)
    expect(agora()).toBe(INICIO)
  })

  it('arredonda para baixo, para o minuto', () => {
    usarRelogioSimulado(instante('2026-11-14T06:30:45-03:00'))
    expect(agora()).toBe('2026-11-14T06:30:00-03:00')
    definirSimulado(instante('2026-11-14T07:10:59-03:00'))
    expect(agora()).toBe('2026-11-14T07:10:00-03:00')
  })

  it('usarRelogioReal() restaura o relógio do sistema', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-14T12:00:00Z'))
    usarRelogioSimulado(INICIO)
    expect(agora()).toBe(INICIO)
    usarRelogioReal()
    expect(simuladoAtivo()).toBe(false)
    expect(agora()).toBe('2026-11-14T09:00:00-03:00')
  })
})
