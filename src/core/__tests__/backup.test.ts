import { describe, expect, it } from 'vitest'
import {
  FORMATO_ATUAL,
  avaliarViagensDoArquivo,
  deveSugerirBackup,
  estadoDoBackup,
  momentoDeSugerirBackup,
  montarBackup,
  nomeDoArquivoDeBackup,
  resumirBackup,
  resumirViagens,
  serializarBackup,
  validarBackup,
  type ConteudoBackup,
} from '../backup'
import { EVENTOS_CASO_3, ETAPAS, LOCAIS, PASSAGEIROS, PLANO, congelar, ev, h } from './fixtures'

const GERADO = h('10:00')

const EVENTO_PARADA = ev.parada('almoco', 'inicio', h('10:00'), { motivo: 'cafe', onde: 'Padaria Tal', tempoPrevistoMin: 20 })

function conteudo(): ConteudoBackup {
  return {
    viagens: [{ ...PLANO.viagem, planoOriginal: congelar() }],
    etapas: ETAPAS,
    locais: LOCAIS,
    trechos: [{ etapaOrigemId: 'monlevade', localOrigemId: 'l-monlevade', etapaDestinoId: 'almoco', localDestinoId: 'l-rest-b', duracaoMin: 220, fonte: 'manual' }],
    eventos: [...EVENTOS_CASO_3, EVENTO_PARADA],
    passageiros: PASSAGEIROS,
    modelos: [{ id: 'atualizacao', texto: 'Olá {agora}', atualizadoEm: h('07:00') }],
  }
}

async function arquivo(c: ConteudoBackup = conteudo()) {
  return serializarBackup(await montarBackup(c, GERADO))
}

/** Arquivo com o conteúdo alterado e o hash refeito, para testar só a estrutura. */
async function arquivoAlterado(alterar: (c: any) => void) {
  const c = JSON.parse(JSON.stringify(conteudo()))
  alterar(c)
  const base = JSON.parse(await arquivo())
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(c)))), (b) => b.toString(16).padStart(2, '0')).join('')
  return JSON.stringify({ ...base, conteudo: c, integridade: { algoritmo: 'SHA-256', hash } })
}

const motivo = (r: Awaited<ReturnType<typeof validarBackup>>) => (r.ok ? '' : r.motivo)

describe('backup: montar e validar', () => {
  it('ida e volta: o conteúdo volta idêntico, com formato, data e integridade', async () => {
    const b = await montarBackup(conteudo(), GERADO)
    expect(b).toMatchObject({ app: 'bordo', formato: FORMATO_ATUAL, geradoEm: GERADO, integridade: { algoritmo: 'SHA-256' } })
    expect(b.integridade.hash).toMatch(/^[0-9a-f]{64}$/)
    const r = await validarBackup(serializarBackup(b))
    expect(r.ok && r.backup).toEqual(b)
  })

  it('o envelope traz um resumo legível, mas a restauração o recalcula do conteúdo', async () => {
    const b = JSON.parse(await arquivo())
    expect(b.resumo).toMatchObject({ geradoEm: GERADO, eventos: 5, passageiros: 38 })
    b.resumo = { mentira: true }
    const r = await validarBackup(JSON.stringify(b))
    expect(r.ok).toBe(true)
    if (r.ok) expect(resumirBackup(r.backup)).toMatchObject({ eventos: 5, passageiros: 38 })
  })

  it('guarda o plano original congelado e a sequência dos eventos como estão', async () => {
    const r = await validarBackup(await arquivo())
    if (!r.ok) throw new Error(r.motivo)
    expect(r.backup.conteudo.viagens[0]?.planoOriginal).toEqual(congelar())
    expect(r.backup.conteudo.eventos.map((e) => e.sequencia)).toEqual(conteudo().eventos.map((e) => e.sequencia))
  })

  it('o nome do arquivo é .txt (o Chrome só compartilha alguns tipos) e leva a data e a hora', () => {
    expect(nomeDoArquivoDeBackup(h('08:05'))).toBe('bordo-backup-2026-11-14-0805.txt')
  })
})

describe('backup: arquivos recusados', () => {
  it('texto que não é JSON', async () => {
    expect(motivo(await validarBackup('isto não é json'))).toMatch(/não é um backup do Bordo/)
    expect(motivo(await validarBackup(''))).toMatch(/não é um backup do Bordo/)
  })

  it('JSON de outro app', async () => {
    expect(motivo(await validarBackup(JSON.stringify({ app: 'outro', formato: 1 })))).toMatch(/não é um backup do Bordo/)
    expect(motivo(await validarBackup('[1,2]'))).toMatch(/não é um backup do Bordo/)
    expect(motivo(await validarBackup('null'))).toMatch(/não é um backup do Bordo/)
  })

  it('formato mais novo pede para atualizar o app; formato ausente ou inválido é recusado', async () => {
    const b = JSON.parse(await arquivo())
    expect(motivo(await validarBackup(JSON.stringify({ ...b, formato: FORMATO_ATUAL + 1 })))).toMatch(/Atualize o app/)
    expect(motivo(await validarBackup(JSON.stringify({ ...b, formato: undefined })))).toMatch(/versão do formato/)
    expect(motivo(await validarBackup(JSON.stringify({ ...b, formato: 0 })))).toMatch(/versão do formato/)
    expect(motivo(await validarBackup(JSON.stringify({ ...b, formato: 1.5 })))).toMatch(/versão do formato/)
  })

  it('arquivo cortado ou alterado: a integridade não confere', async () => {
    const texto = await arquivo()
    expect(motivo(await validarBackup(texto.slice(0, texto.length - 40)))).toMatch(/não é um backup/)
    const b = JSON.parse(texto)
    b.conteudo.viagens[0].nome = 'Outro nome'
    expect(motivo(await validarBackup(JSON.stringify(b)))).toMatch(/corrompido ou foi alterado/)
    const sem = JSON.parse(texto)
    delete sem.integridade
    expect(motivo(await validarBackup(JSON.stringify(sem)))).toMatch(/integridade/)
  })

  it('data de geração ausente', async () => {
    const b = JSON.parse(await arquivo())
    delete b.geradoEm
    expect(motivo(await validarBackup(JSON.stringify(b)))).toMatch(/data em que foi gerado/)
  })

  it('estrutura: lista, campo e tipo inválidos', async () => {
    expect(motivo(await validarBackup(await arquivoAlterado((c) => delete c.eventos)))).toMatch(/falta a lista "eventos"/)
    expect(motivo(await validarBackup(await arquivoAlterado((c) => delete c.viagens[0].nome)))).toMatch(/falta o campo "nome"/)
    expect(motivo(await validarBackup(await arquivoAlterado((c) => (c.viagens[0].status = 'cancelada'))))).toMatch(/status/)
    expect(motivo(await validarBackup(await arquivoAlterado((c) => (c.etapas[1].chegadaRoteiro = '08:25'))))).toMatch(/horário completo/)
    expect(motivo(await validarBackup(await arquivoAlterado((c) => (c.eventos[0].tipo = 'voou'))))).toMatch(/tipo de evento desconhecido/)
    expect(motivo(await validarBackup(await arquivoAlterado((c) => delete c.eventos[1].etapaId)))).toMatch(/etapaId/)
    expect(motivo(await validarBackup(await arquivoAlterado((c) => (c.eventos.at(-1).dados.fase = 'meio'))))).toMatch(/fase/)
  })

  it('identificadores repetidos', async () => {
    expect(motivo(await validarBackup(await arquivoAlterado((c) => (c.eventos[1].id = c.eventos[0].id))))).toMatch(/repetido/)
    expect(motivo(await validarBackup(await arquivoAlterado((c) => (c.passageiros[1].id = c.passageiros[0].id))))).toMatch(/repetido/)
  })

  it('referências quebradas', async () => {
    expect(motivo(await validarBackup(await arquivoAlterado((c) => (c.etapas[2].viagemId = 'fantasma'))))).toMatch(/viagem que não está/)
    expect(motivo(await validarBackup(await arquivoAlterado((c) => (c.etapas[2].alternativas = ['l-fantasma']))))).toMatch(/local que não está/)
    expect(motivo(await validarBackup(await arquivoAlterado((c) => (c.eventos[1].etapaId = 'fantasma'))))).toMatch(/etapa que não é da viagem/)
    expect(motivo(await validarBackup(await arquivoAlterado((c) => (c.passageiros[0].etapaEmbarqueId = 'fantasma'))))).toMatch(/etapa que não é da viagem/)
    expect(motivo(await validarBackup(await arquivoAlterado((c) => (c.trechos[0].localDestinoId = 'fantasma'))))).toMatch(/local que não está/)
    expect(motivo(await validarBackup(await arquivoAlterado((c) => (c.viagens[0].planoOriginal.etapas[0].etapaId = 'fantasma'))))).toMatch(/plano original/)
  })

  it('arquivo vazio de dados é válido (backup de um celular novo)', async () => {
    const vazio: ConteudoBackup = { viagens: [], etapas: [], locais: [], trechos: [], eventos: [], passageiros: [], modelos: [] }
    expect((await validarBackup(await arquivo(vazio))).ok).toBe(true)
  })
})

describe('backup: resumo e juntar', () => {
  it('resume as viagens com eventos, passageiros e último evento', async () => {
    const r = await validarBackup(await arquivo())
    if (!r.ok) throw new Error(r.motivo)
    const resumo = resumirBackup(r.backup)
    expect(resumo).toMatchObject({ geradoEm: GERADO, eventos: 5, passageiros: 38, locais: LOCAIS.length, modelos: 1 })
    expect(resumo.viagens).toEqual([
      expect.objectContaining({ id: PLANO.viagem.id, status: 'em_andamento', eventos: 5, passageiros: 38, ultimoEventoEm: h('10:00') }),
    ])
  })

  it('viagem que o celular não tem, ou tem igual ou mais antiga, vem marcada', () => {
    const [v] = resumirViagens({ viagens: [PLANO.viagem], eventos: conteudo().eventos, passageiros: [] })
    if (!v) throw new Error('sem resumo')
    expect(avaliarViagensDoArquivo([v], [])[0]).toMatchObject({ existeNoCelular: false, marcadaPorPadrao: true })
    expect(avaliarViagensDoArquivo([v], [v])[0]).toMatchObject({ existeNoCelular: true, celularMaisNovo: false, marcadaPorPadrao: true })
    const antigo = { ...v, eventos: 2, ultimaSequencia: 2 }
    expect(avaliarViagensDoArquivo([v], [antigo])[0]).toMatchObject({ marcadaPorPadrao: true, eventosAMaisNoCelular: 0 })
  })

  it('celular com mais registros que o arquivo: vem desmarcada e diz quantos serão perdidos', () => {
    const [v] = resumirViagens({ viagens: [PLANO.viagem], eventos: conteudo().eventos, passageiros: [] })
    if (!v) throw new Error('sem resumo')
    const maisNovo = { ...v, eventos: v.eventos + 3, ultimaSequencia: v.ultimaSequencia + 3 }
    expect(avaliarViagensDoArquivo([v], [maisNovo])[0]).toMatchObject({ celularMaisNovo: true, marcadaPorPadrao: false, eventosAMaisNoCelular: 3 })
  })
})

describe('backup: lembrete', () => {
  const ultimo = { geradoEm: h('08:00'), totalEventos: 10 }

  it('sem backup, está defasado', () => {
    expect(estadoDoBackup(null, 3, h('09:00'))).toMatchObject({ ultimo: null, registrosDesde: 3, horasDesde: null, defasado: true })
  })

  it('recente e com poucos registros não pede atenção', () => {
    expect(estadoDoBackup(ultimo, 14, h('11:59'))).toMatchObject({ registrosDesde: 4, defasado: false })
  })

  it('4 horas ou 15 registros passam a pedir atenção', () => {
    expect(estadoDoBackup(ultimo, 10, h('12:00')).defasado).toBe(true)
    expect(estadoDoBackup(ultimo, 25, h('08:30'))).toMatchObject({ registrosDesde: 15, defasado: true })
    expect(estadoDoBackup(ultimo, 24, h('08:30')).defasado).toBe(false)
  })

  it('registros nunca ficam negativos (viagem apagada depois do backup)', () => {
    expect(estadoDoBackup(ultimo, 2, h('08:30')).registrosDesde).toBe(0)
  })

  it('sugere só se defasado e fora do "agora não"', () => {
    const velho = estadoDoBackup(ultimo, 10, h('13:00'))
    expect(deveSugerirBackup(velho, null, h('13:00'))).toBe(true)
    expect(deveSugerirBackup(velho, h('15:00'), h('14:59'))).toBe(false)
    expect(deveSugerirBackup(velho, h('15:00'), h('15:00'))).toBe(true)
    expect(deveSugerirBackup(estadoDoBackup(ultimo, 10, h('09:00')), null, h('09:00'))).toBe(false)
  })
})

describe('backup: quando sugerir', () => {
  // Os eventos são criados na ordem em que acontecem: a sequência é a da gravação.
  it('parado numa etapa ou aguardando a saída', () => {
    expect(momentoDeSugerirBackup('aguardando_saida', [])).toBe(true)
    expect(momentoDeSugerirBackup('em_parada', [ev.chegada('monlevade', h('08:55'))])).toBe(true)
  })

  it('logo depois de um SAÍMOS; não depois de CHEGAMOS ou de PARAMOS', () => {
    const chegada = ev.chegada('monlevade', h('08:55'))
    const conferencia = ev.conferencia('monlevade', h('09:14'))
    const saida = ev.saida('monlevade', h('09:14'))
    expect(momentoDeSugerirBackup('em_viagem', [chegada, conferencia, saida])).toBe(true)
    const outraChegada = ev.chegada('almoco', h('12:00'))
    expect(momentoDeSugerirBackup('em_viagem', [saida, outraChegada])).toBe(false)
    const parada = ev.parada('cafe', 'inicio', h('14:00'))
    expect(momentoDeSugerirBackup('em_viagem', [saida, parada])).toBe(false)
  })

  it('nunca em parada não planejada nem ao chegar no destino', () => {
    const saida = ev.saida('origem', h('06:47'))
    expect(momentoDeSugerirBackup('parada_nao_planejada', [saida])).toBe(false)
    expect(momentoDeSugerirBackup('chegamos', [saida])).toBe(false)
  })
})
