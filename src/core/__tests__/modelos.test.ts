import { describe, expect, it } from 'vitest'
import {
  MODELO_PADRAO,
  VARIAVEIS_DO_MODELO,
  modeloParaGerar,
  preencherModelo,
  validarModelo,
  variaveisDesconhecidas,
} from '../modelos'

describe('modelos de mensagem: preenchimento', () => {
  it('troca cada variável pelo valor', () => {
    expect(preencherModelo('Olá {a}, {b}!', { a: 'mundo', b: 'tudo bem' })).toBe('Olá mundo, tudo bem!')
  })

  it('remove a linha inteira quando uma variável dela está vazia', () => {
    const texto = preencherModelo('Título\nPróxima: {nome}, às {hora}\nFim', { nome: 'Almoço', hora: '' })
    expect(texto).toBe('Título\nFim')
  })

  it('remove a linha que só tem a variável vazia e junta as linhas em branco seguidas', () => {
    const texto = preencherModelo('Título\n{id}\n\nSituação: {s}\n\n\nRodapé', { id: '', s: 'em viagem' })
    expect(texto).toBe('Título\n\nSituação: em viagem\n\nRodapé')
  })

  it('apara o texto nas pontas', () => {
    expect(preencherModelo('{a}\n\nCorpo\n\n{a}', { a: '' })).toBe('Corpo')
  })

  it('não preenche de novo um valor que contém chaves', () => {
    expect(preencherModelo('{a}', { a: '{b}', b: 'x' })).toBe('{b}')
  })

  it('chave solta e texto entre chaves que não é nome ficam como estão', () => {
    expect(preencherModelo('{ } {} {1x} } {', {})).toBe('{ } {} {1x} } {')
  })
})

describe('modelos de mensagem: validação', () => {
  it('aponta variáveis desconhecidas, sem repetir, e só considera {nome}', () => {
    const validas = VARIAVEIS_DO_MODELO.atualizacao
    expect(variaveisDesconhecidas('{agora} {xyz} {xyz} {outra} {1x} { }', validas)).toEqual(['xyz', 'outra'])
    expect(variaveisDesconhecidas('{Agora}', validas)).toEqual(['Agora'])
  })

  it('variável de um modelo não vale no outro', () => {
    expect(validarModelo('atualizacao', 'Grupo de {grupo}').ok).toBe(false)
    expect(validarModelo('restaurante', 'Grupo de {grupo}').ok).toBe(true)
  })

  it('recusa modelo vazio e variável desconhecida, com o motivo', () => {
    expect(validarModelo('restaurante', '  \n ')).toEqual({ ok: false, motivo: 'O modelo não pode ficar vazio.' })
    expect(validarModelo('restaurante', 'Oi {xyz}')).toEqual({ ok: false, motivo: 'Variável desconhecida: {xyz}.' })
    expect(validarModelo('restaurante', 'Oi {x} {y}')).toEqual({ ok: false, motivo: 'Variáveis desconhecidas: {x}, {y}.' })
  })

  it('os modelos padrão são válidos', () => {
    expect(validarModelo('atualizacao', MODELO_PADRAO.atualizacao).ok).toBe(true)
    expect(validarModelo('restaurante', MODELO_PADRAO.restaurante).ok).toBe(true)
  })
})

describe('modelos de mensagem: qual modelo gerar', () => {
  it('sem modelo salvo, o padrão; com salvo válido, o salvo', () => {
    expect(modeloParaGerar('restaurante', null)).toEqual({ texto: MODELO_PADRAO.restaurante, aviso: null })
    expect(modeloParaGerar('restaurante', 'Grupo {grupo}')).toEqual({ texto: 'Grupo {grupo}', aviso: null })
  })

  it('salvo com variável desconhecida: usa o padrão e avisa', () => {
    const r = modeloParaGerar('restaurante', 'Grupo {xyz}')
    expect(r.texto).toBe(MODELO_PADRAO.restaurante)
    expect(r.aviso).toContain('{xyz}')
    expect(r.aviso).toContain('padrão')
  })
})

describe('modelos de mensagem: o que é variável', () => {
  it('nenhuma variável fala de nome de passageiro', () => {
    const nomes = [...VARIAVEIS_DO_MODELO.atualizacao, ...VARIAVEIS_DO_MODELO.restaurante].map((v) => v.nome)
    for (const n of nomes) expect(n).not.toMatch(/nome|passageiro_|quem|lista/)
  })
})
