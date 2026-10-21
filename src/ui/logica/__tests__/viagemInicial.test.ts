import { describe, expect, it } from 'vitest'
import { PLANO_DEMO } from '../../../demo/dados'
import type { StatusViagem, Viagem } from '../../../core/tipos'
import { viagemParaAbrirDireto } from '../viagemInicial'

const viagem = (id: string, status: StatusViagem): Viagem => ({ ...PLANO_DEMO.viagem, id, status })

describe('viagem aberta direto ao abrir o app', () => {
  it('exatamente uma em andamento: abre ela, mesmo com outras planejando ou concluídas', () => {
    const lista = [viagem('a', 'planejando'), viagem('b', 'em_andamento'), viagem('c', 'concluida')]
    expect(viagemParaAbrirDireto(lista)?.id).toBe('b')
  })

  it('nenhuma em andamento: abre a lista', () => {
    expect(viagemParaAbrirDireto([viagem('a', 'planejando'), viagem('c', 'concluida')])).toBeNull()
    expect(viagemParaAbrirDireto([])).toBeNull()
  })

  it('mais de uma em andamento: abre a lista', () => {
    expect(viagemParaAbrirDireto([viagem('a', 'em_andamento'), viagem('b', 'em_andamento')])).toBeNull()
  })
})
