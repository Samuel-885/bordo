import { describe, expect, it } from 'vitest'
import { formularioDoLocal, formularioLocalVazio, localDoFormulario, validarLocal } from '../formLocal'

describe('formulário de novo local', () => {
  it('nome e cidade são obrigatórios', () => {
    expect(Object.keys(validarLocal(formularioLocalVazio())).sort()).toEqual(['cidade', 'nome'])
  })

  it('coordenadas inválidas e abre sem fecha são recusados', () => {
    const f = { ...formularioLocalVazio(), nome: 'Posto fictício', cidade: 'Cidade X', coordenadas: 'abc', abre: '06:00' }
    expect(Object.keys(validarLocal(f)).sort()).toEqual(['coordenadas', 'horario'])
  })

  it('local mínimo: sem coordenadas, horário nem telefone', () => {
    const f = { ...formularioLocalVazio(), nome: ' Posto fictício ', cidade: 'Cidade X' }
    expect(validarLocal(f)).toEqual({})
    expect(localDoFormulario(f, 'id1')).toEqual({ id: 'id1', nome: 'Posto fictício', cidade: 'Cidade X', tipo: 'restaurante', onibusPara: 'nao_sei' })
  })

  it('local completo', () => {
    const f = {
      ...formularioLocalVazio(),
      nome: 'Restaurante fictício',
      cidade: 'Cidade X',
      tipo: 'posto',
      coordenadas: '-19.4687, -42.5367',
      abre: '11:00',
      fecha: '15:00',
      telefone: '(31) 0000-0000',
      onibusPara: 'sim' as const,
      observacoes: 'Estacionamento amplo',
    }
    expect(localDoFormulario(f, 'id2')).toEqual({
      id: 'id2',
      nome: 'Restaurante fictício',
      cidade: 'Cidade X',
      tipo: 'posto',
      coordenadas: { lat: -19.4687, lng: -42.5367 },
      abre: '11:00',
      fecha: '15:00',
      telefone: '(31) 0000-0000',
      onibusPara: 'sim',
      observacoes: 'Estacionamento amplo',
    })
  })

  it('edição: o formulário nasce do local e salvar mantém id e marcação', () => {
    const local = {
      id: 'id3',
      nome: 'Restaurante fictício',
      cidade: 'Cidade X',
      tipo: 'posto',
      coordenadas: { lat: -19.4687, lng: -42.5367 },
      abre: '11:00',
      fecha: '15:00',
      telefone: '(31) 0000-0000',
      onibusPara: 'sim' as const,
      observacoes: 'Estacionamento amplo',
      marcacao: 'favorito' as const,
    }
    const f = formularioDoLocal(local)
    expect(validarLocal(f)).toEqual({})
    expect(localDoFormulario(f, local.id, local)).toEqual(local)
    // Apagar um campo opcional o tira do local.
    expect(localDoFormulario({ ...f, telefone: '', abre: '', fecha: '' }, local.id, local).telefone).toBeUndefined()
  })
})
