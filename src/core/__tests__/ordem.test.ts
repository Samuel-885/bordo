import { describe, expect, it } from 'vitest'
import { moverEtapa, normalizarOrdem, paresVizinhos, podeMover } from '../ordem'
import type { Etapa } from '../tipos'
import { PLANO } from './fixtures'

const ids = (l: Etapa[]) => l.map((e) => e.id)

describe('ordem das etapas', () => {
  it('origem sempre primeiro e destino sempre último, mesmo com ordens trocadas', () => {
    const embaralhadas = PLANO.etapas.map((e) =>
      e.id === 'origem' ? { ...e, ordem: 99 } : e.id === 'destino' ? { ...e, ordem: 0 } : e,
    )
    const lista = normalizarOrdem(embaralhadas)
    expect(ids(lista)).toEqual(['origem', 'monlevade', 'almoco', 'cafe', 'jantar', 'destino'])
    expect(lista.map((e) => e.ordem)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('sobe e desce só entre etapas do meio', () => {
    expect(ids(moverEtapa(PLANO.etapas, 'cafe', 'subir'))).toEqual(['origem', 'monlevade', 'cafe', 'almoco', 'jantar', 'destino'])
    expect(ids(moverEtapa(PLANO.etapas, 'cafe', 'descer'))).toEqual(['origem', 'monlevade', 'almoco', 'jantar', 'cafe', 'destino'])
  })

  it('não move a origem, o destino nem passa por cima deles', () => {
    expect(podeMover(PLANO.etapas, 'origem', 'descer')).toBe(false)
    expect(podeMover(PLANO.etapas, 'destino', 'subir')).toBe(false)
    expect(podeMover(PLANO.etapas, 'monlevade', 'subir')).toBe(false)
    expect(podeMover(PLANO.etapas, 'jantar', 'descer')).toBe(false)
    expect(ids(moverEtapa(PLANO.etapas, 'monlevade', 'subir'))).toEqual(ids(normalizarOrdem(PLANO.etapas)))
  })

  it('pares de vizinhas', () => {
    expect(paresVizinhos(PLANO.etapas).map(([a, b]) => `${a.id}>${b.id}`)).toEqual([
      'origem>monlevade',
      'monlevade>almoco',
      'almoco>cafe',
      'cafe>jantar',
      'jantar>destino',
    ])
  })
})
