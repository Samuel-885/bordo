import { describe, expect, it } from 'vitest'
import { formularioDoLocal, formularioLocalVazio, localDoFormulario, validarLocal } from '../formLocal'
import { formularioComResultado, localizacaoDoResultado, textoDoErroDeBusca } from '../servicos'

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

describe('busca de endereço no formulário (fase 8)', () => {
  const resultado = { nome: 'Posto fictício', cidade: 'Cidade X', estado: 'Minas Gerais', lat: -19.8097, lng: -43.1733 }

  it('escolher um resultado preenche coordenadas e cidade, sem mexer no resto', () => {
    const f = { ...formularioLocalVazio(), nome: 'Meu nome', cidade: 'Outra', telefone: '(31) 0000-0000', abre: '06:00', fecha: '22:00' }
    const depois = formularioComResultado(f, resultado)
    expect(depois).toEqual({ ...f, coordenadas: '-19.8097, -43.1733', cidade: 'Cidade X' })
    expect(validarLocal(depois)).toEqual({})
    expect(localDoFormulario(depois, 'id1').coordenadas).toEqual({ lat: -19.8097, lng: -43.1733 })
  })

  it('resultado sem cidade mantém a cidade digitada; as coordenadas continuam editáveis', () => {
    const f = { ...formularioLocalVazio(), cidade: 'Digitada' }
    const depois = formularioComResultado(f, { ...resultado, cidade: '' })
    expect(depois.cidade).toBe('Digitada')
    expect(validarLocal({ ...depois, nome: 'x', coordenadas: '-19.5, -43.1' })).toEqual({})
  })

  it('o campo de coordenadas coladas continua lendo texto e link do Google Maps', () => {
    const f = { ...formularioLocalVazio(), nome: 'x', cidade: 'y' }
    expect(validarLocal({ ...f, coordenadas: '-19.4687, -42.5367' })).toEqual({})
    expect(validarLocal({ ...f, coordenadas: 'https://www.google.com/maps/@-19.4687,-42.5367,15z' })).toEqual({})
    expect(validarLocal({ ...f, coordenadas: 'abc' }).coordenadas).toBeTruthy()
  })

  it('textos das falhas e da localização', () => {
    expect(textoDoErroDeBusca('sem_internet')).toMatch(/resto do formulário funciona/)
    expect(textoDoErroDeBusca('limite')).toMatch(/pedidos demais/)
    expect(textoDoErroDeBusca('fora')).toMatch(/fora do ar/)
    expect(textoDoErroDeBusca('tempo_esgotado')).toMatch(/demorou/)
    expect(localizacaoDoResultado(resultado)).toBe('Cidade X, Minas Gerais')
    expect(localizacaoDoResultado({ ...resultado, cidade: '' })).toBe('Minas Gerais')
  })
})
