import { describe, expect, it } from 'vitest'
import { avisosDoPlano, horariosForaDeOrdem } from '../avisos'
import { estadosDoPlano } from '../previsao'
import type { DadosPlano, Etapa, Local } from '../tipos'
import { h, LOCAIS, PLANO } from './fixtures'

function comEtapa(id: string, mudanca: Partial<Etapa>, locais: Local[] = LOCAIS): DadosPlano {
  return {
    ...PLANO,
    locais,
    etapas: PLANO.etapas.map((e) => (e.id === id ? { ...e, ...mudanca } : e)),
  }
}

function avisos(d: DadosPlano) {
  return avisosDoPlano(d, estadosDoPlano(d))
}

describe('avisos do planejamento', () => {
  it('plano completo, com horário de funcionamento, não tem avisos de local', () => {
    const locaisComHorario = LOCAIS.map((l) => ({ ...l, abre: '07:00', fecha: '23:00' }))
    const d = { ...PLANO, locais: locaisComHorario }
    expect(avisos(d)).toEqual([])
  })

  it('parada flexível sem local escolhido', () => {
    const d = comEtapa('cafe', { localId: null })
    expect(avisos(d)).toContainEqual({ tipo: 'flexivel_sem_local', etapaId: 'cafe' })
  })

  it('local sem horário de funcionamento: só as paradas flexíveis, listando os candidatos sem abre/fecha', () => {
    const locais = LOCAIS.map((l) => (l.id === 'l-rest-b' ? { ...l, abre: '11:00', fecha: '15:00' } : l))
    const d = comEtapa('almoco', { alternativas: ['l-rest-b', 'l-rest-c'] }, locais)
    const doAlmoco = avisos(d).filter((a) => a.tipo === 'local_sem_horario' && a.etapaId === 'almoco')
    expect(doAlmoco).toEqual([{ tipo: 'local_sem_horario', etapaId: 'almoco', localIds: ['l-rest-a', 'l-rest-c'] }])
    // A origem, o ponto obrigatório e o destino não geram esse aviso.
    expect(avisos(d).some((a) => 'etapaId' in a && (a.etapaId === 'monlevade' || a.etapaId === 'origem'))).toBe(false)
  })

  it('chegada prevista fora da janela, antes ou depois', () => {
    const cedo = comEtapa('almoco', { janelaInicio: h('12:30'), janelaFim: h('14:00') })
    expect(avisos(cedo)).toContainEqual({ tipo: 'chegada_fora_da_janela', etapaId: 'almoco' })
    const tarde = comEtapa('almoco', { janelaInicio: h('10:00'), janelaFim: h('11:30') })
    expect(avisos(tarde)).toContainEqual({ tipo: 'chegada_fora_da_janela', etapaId: 'almoco' })
    const dentro = comEtapa('almoco', { janelaInicio: h('11:30'), janelaFim: h('14:00') })
    expect(avisos(dentro).some((a) => a.tipo === 'chegada_fora_da_janela')).toBe(false)
  })

  it('janela que atravessa a meia-noite: chegada 00:30 está dentro de 23:00–01:00', () => {
    const d = comEtapa('jantar', { chegadaRoteiro: h('00:30', 1), janelaInicio: h('23:00'), janelaFim: h('01:00', 1) })
    expect(avisos(d).some((a) => a.tipo === 'chegada_fora_da_janela' && a.etapaId === 'jantar')).toBe(false)
  })
})

describe('horários fora de ordem', () => {
  it('plano de referência está em ordem', () => {
    expect(horariosForaDeOrdem(PLANO)).toEqual([])
  })

  it('chegada antes da saída da etapa anterior é apontada', () => {
    const d = comEtapa('cafe', { chegadaRoteiro: h('11:00') })
    expect(horariosForaDeOrdem(d)).toEqual([{ etapaId: 'cafe', anteriorId: 'almoco' }])
  })

  it('compara com a última etapa que tem horário, pulando as sem horário', () => {
    const d = comEtapa('almoco', { chegadaRoteiro: undefined })
    expect(horariosForaDeOrdem(d)).toEqual([])
    const fora = comEtapa('cafe', { chegadaRoteiro: h('08:00') })
    fora.etapas = fora.etapas.map((e) => (e.id === 'almoco' ? { ...e, chegadaRoteiro: undefined } : e))
    expect(horariosForaDeOrdem(fora)).toEqual([{ etapaId: 'cafe', anteriorId: 'monlevade' }])
  })
})
