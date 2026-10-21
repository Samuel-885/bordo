import { describe, expect, it } from 'vitest'
import { formatarDuracao, horasEMinutosDe, minutosDeHorasEMinutos } from '../duracao'

describe('duração', () => {
  it('formata', () => {
    expect(formatarDuracao(115)).toBe('1h55')
    expect(formatarDuracao(420)).toBe('7h00')
    expect(formatarDuracao(45)).toBe('45 min')
  })

  it('horas e minutos digitados viram minutos', () => {
    expect(minutosDeHorasEMinutos('3', '20')).toBe(200)
    expect(minutosDeHorasEMinutos('', '45')).toBe(45)
    expect(minutosDeHorasEMinutos('2', '')).toBe(120)
  })

  it('recusa vazio, zero, minutos acima de 59 e texto', () => {
    for (const [h, m] of [['', ''], ['0', '0'], ['1', '60'], ['x', '5'], ['-1', '5'], ['1.5', '0']] as const) {
      expect(minutosDeHorasEMinutos(h, m)).toBeNull()
    }
  })

  it('divide de volta', () => {
    expect(horasEMinutosDe(200)).toEqual({ horas: '3', minutos: '20' })
  })
})
