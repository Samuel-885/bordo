import { describe, expect, it, vi } from 'vitest'
import { pedirArmazenamentoPersistente } from '../persistencia'

describe('armazenamento persistente', () => {
  it('indisponível quando o navegador não tem a API', async () => {
    expect(await pedirArmazenamentoPersistente(undefined)).toBe('indisponivel')
    expect(await pedirArmazenamentoPersistente({} as StorageManager)).toBe('indisponivel')
  })

  it('pede e informa se foi concedido ou negado', async () => {
    const concede = { persisted: vi.fn(async () => false), persist: vi.fn(async () => true) }
    expect(await pedirArmazenamentoPersistente(concede)).toBe('concedido')
    expect(concede.persist).toHaveBeenCalledOnce()
    const nega = { persisted: vi.fn(async () => false), persist: vi.fn(async () => false) }
    expect(await pedirArmazenamentoPersistente(nega)).toBe('negado')
  })

  it('não pede de novo se já é persistente', async () => {
    const ja = { persisted: vi.fn(async () => true), persist: vi.fn(async () => true) }
    expect(await pedirArmazenamentoPersistente(ja)).toBe('concedido')
    expect(ja.persist).not.toHaveBeenCalled()
  })

  it('erro do navegador vira "negado"', async () => {
    const quebra = { persisted: vi.fn(async () => false), persist: vi.fn(async () => { throw new Error('x') }) }
    expect(await pedirArmazenamentoPersistente(quebra)).toBe('negado')
  })
})
