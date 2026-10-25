// Backup (formato 1) com os eventos da mudança de roteiro em viagem: aditivo, sem mudar o formato.

import { describe, expect, it } from 'vitest'
import { FORMATO_ATUAL, montarBackup, serializarBackup, validarBackup, type ConteudoBackup } from '../backup'
import { aplicarInclusoes } from '../inclusao'
import { calcularEstado } from '../previsao'
import type { Local, Trecho } from '../tipos'
import { ETAPAS, EVENTOS_CASO_2, LOCAIS, PASSAGEIROS, PLANO, congelar, ev, h } from './fixtures'

const MIRANTE: Local = { id: 'l-mirante', nome: 'Mirante', cidade: 'Cidade do mirante', tipo: 'parada', onibusPara: 'sim' }
const NOVO: Local = { id: 'l-novo', nome: 'Restaurante Novo', cidade: 'Cidade do almoço', tipo: 'restaurante', onibusPara: 'sim' }
const tr = (eo: string, lo: string, ed: string, ld: string, min: number): Trecho => ({
  etapaOrigemId: eo, localOrigemId: lo, etapaDestinoId: ed, localDestinoId: ld, duracaoMin: min, fonte: 'manual',
})

const incluida = ev.incluirParada(
  'n1',
  { apos: 'monlevade', localId: 'l-mirante', categoria: 'visita', permanenciaMin: 40, motivo: 'Foto do grupo', trechos: [tr('monlevade', 'l-monlevade', 'n1', 'l-mirante', 30), tr('n1', 'l-mirante', 'almoco', 'l-rest-a', 180)] },
  h('09:00'),
)
const local = ev.localIncluido('cafe', { localId: 'l-novo', trechos: [tr('almoco', 'l-rest-a', 'cafe', 'l-novo', 100), tr('cafe', 'l-novo', 'jantar', 'l-jantar', 200)] }, h('09:01'))
const chegou = ev.chegada('n1', h('09:41'))
const cancelada = ev.cancelarInclusao('n1', incluida.id, h('09:02'))

function conteudo(eventos = [...EVENTOS_CASO_2, incluida, local, chegou]): ConteudoBackup {
  return {
    viagens: [{ ...PLANO.viagem, planoOriginal: congelar() }],
    etapas: ETAPAS,
    locais: [...LOCAIS, MIRANTE, NOVO],
    trechos: [],
    eventos,
    passageiros: PASSAGEIROS,
    modelos: [],
  }
}

async function ida_e_volta(c: ConteudoBackup) {
  const r = await validarBackup(serializarBackup(await montarBackup(c, h('10:00'))))
  if (!r.ok) throw new Error(r.motivo)
  return r.backup.conteudo
}

async function arquivoAlterado(alterar: (c: any) => void) {
  const c = JSON.parse(JSON.stringify(conteudo()))
  alterar(c)
  const base = JSON.parse(serializarBackup(await montarBackup(conteudo(), h('10:00'))))
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(c)))), (b) => b.toString(16).padStart(2, '0')).join('')
  return JSON.stringify({ ...base, conteudo: c, integridade: { algoritmo: 'SHA-256', hash } })
}
const motivo = (r: Awaited<ReturnType<typeof validarBackup>>) => (r.ok ? '' : r.motivo)

describe('backup com mudança de roteiro em viagem', () => {
  it('B1 o formato continua 1 e a previsão e o original voltam idênticos', async () => {
    expect(FORMATO_ATUAL).toBe(1)
    const c = conteudo()
    const volta = await ida_e_volta(c)
    expect(volta).toEqual(c)
    const original = volta.viagens[0]!.planoOriginal!
    expect(original).toEqual(congelar())
    const antes = calcularEstado(aplicarInclusoes({ ...PLANO, locais: c.locais }, c.eventos), original, c.eventos, h('09:50'))
    const depois = calcularEstado(aplicarInclusoes({ ...PLANO, locais: volta.locais }, volta.eventos), original, volta.eventos, h('09:50'))
    expect(depois).toEqual(antes)
  })

  it('aceita a inclusão cancelada', async () => {
    const r = await validarBackup(serializarBackup(await montarBackup(conteudo([...EVENTOS_CASO_2, incluida, cancelada]), h('10:00'))))
    expect(r.ok).toBe(true)
  })

  it('B2 id de etapa criado pelo evento é aceito; local inexistente e referência quebrada são recusados', async () => {
    expect((await validarBackup(await arquivoAlterado(() => {}))).ok).toBe(true)
    const semLocal = await validarBackup(await arquivoAlterado((c) => (c.locais = c.locais.filter((l: Local) => l.id !== 'l-mirante'))))
    expect(motivo(semLocal)).toContain('local que não está no arquivo')
    const aposRuim = await validarBackup(await arquivoAlterado((c) => (c.eventos.find((e: any) => e.tipo === 'parada_incluida').dados.apos = 'fantasma')))
    expect(motivo(aposRuim)).toContain('etapa que não é da viagem')
    const chegadaFantasma = await validarBackup(await arquivoAlterado((c) => (c.eventos.find((e: any) => e.tipo === 'chegada' && e.etapaId === 'n1').etapaId = 'n9')))
    expect(motivo(chegadaFantasma)).toContain('etapa que não é da viagem')
    const trechoRuim = await validarBackup(await arquivoAlterado((c) => (c.eventos.find((e: any) => e.tipo === 'local_incluido').dados.trechos[0].etapaDestinoId = 'n9')))
    expect(motivo(trechoRuim)).toContain('trecho de inclusão')
    const cancelaNada = await validarBackup(await arquivoAlterado((c) => c.eventos.push({ id: 'x', viagemId: c.viagens[0].id, tipo: 'inclusao_cancelada', horarioFato: h('09:30'), registradoEm: h('09:30'), etapaId: 'n1', dados: { eventoId: 'nao-existe' } })))
    expect(motivo(cancelaNada)).toContain('cancelamento')
    const repetida = await validarBackup(await arquivoAlterado((c) => (c.eventos.find((e: any) => e.tipo === 'parada_incluida').etapaId = 'almoco')))
    expect(motivo(repetida)).toContain('repete o id')
  })

  it('B2 estrutura dos dados: trecho com fonte inválida e permanência não numérica', async () => {
    const fonte = await validarBackup(await arquivoAlterado((c) => (c.eventos.find((e: any) => e.tipo === 'local_incluido').dados.trechos[0].fonte = 'palpite')))
    expect(fonte.ok).toBe(false)
    const perm = await validarBackup(await arquivoAlterado((c) => (c.eventos.find((e: any) => e.tipo === 'parada_incluida').dados.permanenciaMin = 'muito')))
    expect(perm.ok).toBe(false)
  })

  it('B3 arquivo antigo, sem os eventos novos, continua valendo', async () => {
    const r = await validarBackup(serializarBackup(await montarBackup(conteudo(EVENTOS_CASO_2), h('10:00'))))
    expect(r.ok).toBe(true)
  })
})
