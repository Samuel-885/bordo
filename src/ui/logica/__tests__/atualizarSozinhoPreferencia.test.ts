// A preferência do modo "atualizar sozinho" guarda o id da viagem em que foi ligada.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { definirAtualizarSozinho, lerViagemDoAtualizarSozinho } from '../../atualizarSozinho'

beforeEach(() => {
  const dados = new Map<string, string>()
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => dados.get(k) ?? null,
      setItem: (k: string, v: string) => void dados.set(k, v),
      removeItem: (k: string) => void dados.delete(k),
    },
    dispatchEvent: () => true,
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('preferência do atualizar sozinho', () => {
  it('desligada por padrão', () => {
    expect(lerViagemDoAtualizarSozinho()).toBeNull()
  })

  it('ligar guarda o id da viagem; desligar nela zera', () => {
    definirAtualizarSozinho('viagem-a', true)
    expect(lerViagemDoAtualizarSozinho()).toBe('viagem-a')
    definirAtualizarSozinho('viagem-a', false)
    expect(lerViagemDoAtualizarSozinho()).toBeNull()
  })

  it('ligar em outra viagem passa a preferência para ela', () => {
    definirAtualizarSozinho('viagem-a', true)
    definirAtualizarSozinho('viagem-b', true)
    expect(lerViagemDoAtualizarSozinho()).toBe('viagem-b')
  })

  it('desligar numa viagem que não é a da preferência não mexe nela', () => {
    definirAtualizarSozinho('viagem-a', true)
    definirAtualizarSozinho('viagem-b', false)
    expect(lerViagemDoAtualizarSozinho()).toBe('viagem-a')
  })
})
