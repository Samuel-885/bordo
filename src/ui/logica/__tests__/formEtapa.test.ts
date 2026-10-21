import { describe, expect, it } from 'vitest'
import { avisosDoPlano } from '../../../core/avisos'
import { estadosDoPlano } from '../../../core/previsao'
import { instante } from '../../../core/tempo'
import type { Etapa } from '../../../core/tipos'
import { PLANO_DEMO } from '../../../demo/dados'
import {
  adicionarCandidato,
  etapaDoFormulario,
  formularioDaEtapa,
  formularioVazio,
  previaDaEtapa,
  removerCandidato,
  trocarTipo,
  validarFormulario,
} from '../formEtapa'

const DATA_SAIDA = instante('2026-11-14T00:00:00-03:00')
const demo = (id: string) => PLANO_DEMO.etapas.find((e) => e.id === id)!
const ctx = (id: string, sem: string[] = []) => ({
  id,
  ordem: PLANO_DEMO.etapas.find((e) => e.id === id)?.ordem,
  viagemId: 'demo-viagem',
  dataSaida: DATA_SAIDA,
  outras: PLANO_DEMO.etapas.filter((e) => e.id !== id && !sem.includes(e.id)),
})

describe('formulário da etapa', () => {
  it('ida e volta: etapa → formulário → etapa devolve a mesma etapa (flexível com alternativas)', () => {
    const almoco = demo('demo-almoco')
    const f = formularioDaEtapa(almoco)
    expect(f.candidatos).toEqual(['demo-l-rest-a', 'demo-l-rest-b', 'demo-l-rest-c'])
    expect(f.preferido).toBe('demo-l-rest-a')
    const { etapa, viradas } = etapaDoFormulario({ ...f, categoria: 'almoco' }, ctx('demo-almoco'))
    expect(viradas).toEqual([])
    expect(etapa).toMatchObject({ localId: 'demo-l-rest-a', alternativas: ['demo-l-rest-b', 'demo-l-rest-c'], chegadaRoteiro: almoco.chegadaRoteiro, permanenciaMin: 60, ordem: 3 })
  })

  it('a preferida muda: a antiga vira alternativa', () => {
    const f = { ...formularioDaEtapa(demo('demo-almoco')), categoria: 'almoco', preferido: 'demo-l-rest-c' }
    const { etapa } = etapaDoFormulario(f, ctx('demo-almoco'))
    expect(etapa.localId).toBe('demo-l-rest-c')
    expect(etapa.alternativas).toEqual(['demo-l-rest-a', 'demo-l-rest-b'])
  })

  it('remover a preferida passa a preferência para o primeiro que sobrar; remover todas deixa vazio', () => {
    let f = { ...formularioVazio('flexivel'), categoria: 'cafe' }
    f = adicionarCandidato(adicionarCandidato(f, 'a'), 'b')
    expect(f.preferido).toBe('a')
    f = removerCandidato(f, 'a')
    expect(f).toMatchObject({ candidatos: ['b'], preferido: 'b' })
    f = removerCandidato(f, 'b')
    expect(f).toMatchObject({ candidatos: [], preferido: '' })
    expect(etapaDoFormulario(f, ctx('x')).etapa.localId).toBeNull()
  })

  it('adicionar o mesmo candidato duas vezes não duplica', () => {
    const f = adicionarCandidato(adicionarCandidato(formularioVazio(), 'a'), 'a')
    expect(f.candidatos).toEqual(['a'])
  })

  it('horário menor que o da etapa anterior vira o dia seguinte e é apontado', () => {
    // Anterior sai 20:30 + 50 = 21:20; destino às 00:10.
    const f = { ...formularioDaEtapa(demo('demo-destino')), hora: '00:10' }
    const { etapa, viradas } = etapaDoFormulario(f, ctx('demo-destino'))
    expect(etapa.chegadaRoteiro).toBe('2026-11-15T00:10:00-03:00')
    expect(viradas).toEqual([{ campo: 'chegada', instante: '2026-11-15T00:10:00-03:00' }])
  })

  it('janela que atravessa a meia-noite, ancorada no dia da chegada', () => {
    const f = { ...formularioDaEtapa(demo('demo-jantar')), categoria: 'jantar', hora: '23:30', janelaInicio: '23:00', janelaFim: '01:00' }
    const { etapa, viradas } = etapaDoFormulario(f, ctx('demo-jantar'))
    expect(etapa.janelaInicio).toBe('2026-11-14T23:00:00-03:00')
    expect(etapa.janelaFim).toBe('2026-11-15T01:00:00-03:00')
    expect(viradas.map((v) => v.campo)).toEqual(['janelaFim'])
  })

  it('janela que atravessa a meia-noite com chegada às 00:30 do dia 15: 23:00 do dia 14 até 01:00 do dia 15, sem aviso', () => {
    const f = { ...formularioDaEtapa(demo('demo-jantar')), categoria: 'jantar', hora: '00:30', janelaInicio: '23:00', janelaFim: '01:00' }
    const { etapa, viradas } = etapaDoFormulario(f, ctx('demo-jantar'))
    expect(etapa.chegadaRoteiro).toBe('2026-11-15T00:30:00-03:00')
    expect(etapa.janelaInicio).toBe('2026-11-14T23:00:00-03:00')
    expect(etapa.janelaFim).toBe('2026-11-15T01:00:00-03:00')
    expect(viradas.map((v) => v.campo)).toEqual(['chegada', 'janelaFim'])

    const plano = { ...PLANO_DEMO, etapas: PLANO_DEMO.etapas.map((e) => (e.id === 'demo-jantar' ? etapa : e)) }
    const avisos = avisosDoPlano(plano, estadosDoPlano(plano))
    expect(avisos.some((a) => a.tipo === 'chegada_fora_da_janela')).toBe(false)
  })

  it('janela sem chegada prevista usa o dia da referência anterior', () => {
    const f = { ...formularioDaEtapa(demo('demo-jantar')), categoria: 'jantar', hora: '', janelaInicio: '20:00', janelaFim: '21:00' }
    const { etapa } = etapaDoFormulario(f, ctx('demo-jantar'))
    expect(etapa.chegadaRoteiro).toBeUndefined()
    expect(etapa.janelaInicio).toBe('2026-11-14T20:00:00-03:00')
  })

  it('origem: a hora é a saída, no dia da viagem, e a permanência é zero', () => {
    const f = { ...formularioVazio('origem'), localId: 'demo-l-saida', hora: '06:30' }
    const { etapa, viradas } = etapaDoFormulario(f, ctx('demo-origem', ['demo-origem']))
    expect(etapa).toMatchObject({ tipo: 'origem', chegadaRoteiro: '2026-11-14T06:30:00-03:00', permanenciaMin: 0, ordem: 1 })
    expect(viradas).toEqual([])
  })

  it('etapa nova entra antes do destino', () => {
    const f = { ...formularioVazio('flexivel'), categoria: 'banheiro' }
    expect(etapaDoFormulario(f, ctx('nova')).etapa.ordem).toBe(6)
  })

  it('trocar o tipo mantém o local e a hora e zera o que não serve', () => {
    const obrig = { ...formularioVazio('obrigatoria'), localId: 'l1', hora: '08:00', motivo: 'outro' }
    const flex = trocarTipo(obrig, 'flexivel')
    expect(flex).toMatchObject({ tipo: 'flexivel', candidatos: ['l1'], preferido: 'l1', hora: '08:00', motivo: '' })
    const dest = trocarTipo(flex, 'destino')
    expect(dest).toMatchObject({ tipo: 'destino', localId: 'l1', permanenciaMin: 0, candidatos: [] })
  })

  it('validação por tipo', () => {
    expect(validarFormulario(formularioVazio('obrigatoria'))).toMatchObject({ local: expect.any(String), motivo: expect.any(String) })
    expect(validarFormulario({ ...formularioVazio('destino'), localId: 'l' })).toEqual({})
    expect(validarFormulario(formularioVazio('flexivel'))).toEqual({ categoria: expect.any(String) })
    expect(validarFormulario({ ...formularioVazio('flexivel'), categoria: 'cafe', janelaInicio: '10:00' }).janela).toBeDefined()
    expect(validarFormulario({ ...formularioVazio('flexivel'), categoria: 'cafe', permanenciaMin: 0 }).permanencia).toBeDefined()
    expect(validarFormulario({ ...formularioVazio('flexivel'), categoria: 'cafe', janelaInicio: '10:00', janelaFim: '11:00' })).toEqual({})
  })

  it('a prévia calcula a saída com o plano e a chegada do rascunho', () => {
    const rascunho: Etapa = { ...demo('demo-cafe'), permanenciaMin: 45 }
    const p = previaDaEtapa(PLANO_DEMO, rascunho)
    expect(p.chegada).toBe('2026-11-14T16:00:00-03:00')
    expect(p.saida).toBe('2026-11-14T16:45:00-03:00')
  })

  it('a prévia da etapa sem horário e sem trecho não tem saída', () => {
    const nova: Etapa = { id: 'n', viagemId: 'demo-viagem', ordem: 99, tipo: 'flexivel', localId: 'demo-l-cafe', alternativas: [], permanenciaMin: 20 }
    expect(previaDaEtapa(PLANO_DEMO, nova).saida).toBeNull()
  })
})
