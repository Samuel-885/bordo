// Backup (fase 10a): monta, valida e resume o arquivo. Lógica pura: não lê o banco, não usa o
// relógio (a data do backup vem de quem chama) e não recalcula nada. O arquivo guarda os
// registros exatamente como estão, inclusive o plano original congelado e a sequência de gravação
// dos eventos. As consultas ao Google Maps ficam de fora.

import { CONFIG } from './config'
import { antes, diferencaMin, instante } from './tempo'
import { emOrdemDeGravacao } from './eventos'
import type { Situacao } from './registro'
import type { Evento, Etapa, Instante, Local, ModeloSalvo, Passageiro, Trecho, UltimoBackup, Viagem } from './tipos'

export const APP_DO_BACKUP = 'bordo'
/** Versão do formato do arquivo. Sobe quando o formato muda de um jeito que o app antigo não lê. */
export const FORMATO_ATUAL = 1
/** Teto de tamanho do texto lido na restauração (evita travar o celular com um arquivo qualquer). */
export const TAMANHO_MAXIMO_CHARS = 30_000_000

export interface ConteudoBackup {
  viagens: Viagem[]
  etapas: Etapa[]
  locais: Local[]
  trechos: Trecho[]
  eventos: Evento[]
  passageiros: Passageiro[]
  modelos: ModeloSalvo[]
}

export interface Backup {
  app: typeof APP_DO_BACKUP
  formato: number
  geradoEm: Instante
  /** Só para quem abre o arquivo: a restauração recalcula o resumo a partir do conteúdo e não confia neste. */
  resumo: ResumoBackup
  conteudo: ConteudoBackup
  integridade: { algoritmo: 'SHA-256'; hash: string }
}

export type ResultadoValidacao = { ok: true; backup: Backup } | { ok: false; motivo: string }

// ---------- Integridade ----------

async function hashDoConteudo(conteudo: ConteudoBackup): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new Error('Este navegador não consegue calcular a verificação do arquivo (precisa de conexão segura, HTTPS).')
  const bytes = new TextEncoder().encode(JSON.stringify(conteudo))
  const resumo = new Uint8Array(await subtle.digest('SHA-256', bytes))
  return Array.from(resumo, (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function montarBackup(conteudo: ConteudoBackup, geradoEm: Instante): Promise<Backup> {
  return {
    app: APP_DO_BACKUP,
    formato: FORMATO_ATUAL,
    geradoEm,
    resumo: resumirConteudo(conteudo, geradoEm),
    conteudo,
    integridade: { algoritmo: 'SHA-256', hash: await hashDoConteudo(conteudo) },
  }
}

export function serializarBackup(backup: Backup): string {
  return JSON.stringify(backup)
}

/** AAAA-MM-DD-HHMM, da hora local do instante informado (o fuso é o do próprio instante). */
export function nomeDoArquivoDeBackup(geradoEm: Instante): string {
  const [data = '', hora = ''] = geradoEm.split('T')
  return `bordo-backup-${data}-${hora.slice(0, 2)}${hora.slice(3, 5)}.txt`
}

// ---------- Resumo ----------

export interface ResumoViagem {
  id: string
  nome: string
  tipo: Viagem['tipo']
  status: Viagem['status']
  dataSaida: Instante
  eventos: number
  passageiros: number
  /** Maior sequência de gravação (0 se nenhum evento a tem). */
  ultimaSequencia: number
  /** Horário do fato do evento mais recente; vazio sem eventos. */
  ultimoEventoEm: Instante | null
}

export interface ResumoBackup {
  geradoEm: Instante
  viagens: ResumoViagem[]
  eventos: number
  passageiros: number
  locais: number
  modelos: number
}

export function resumirViagens(c: Pick<ConteudoBackup, 'viagens' | 'eventos' | 'passageiros'>): ResumoViagem[] {
  return c.viagens.map((v) => {
    const eventos = c.eventos.filter((e) => e.viagemId === v.id)
    const ultimo = eventos.reduce<Evento | null>((m, e) => (m === null || antes(m.horarioFato, e.horarioFato) ? e : m), null)
    return {
      id: v.id,
      nome: v.nome,
      tipo: v.tipo,
      status: v.status,
      dataSaida: v.dataSaida,
      eventos: eventos.length,
      passageiros: c.passageiros.filter((p) => p.viagemId === v.id).length,
      ultimaSequencia: eventos.reduce((m, e) => Math.max(m, e.sequencia ?? 0), 0),
      ultimoEventoEm: ultimo?.horarioFato ?? null,
    }
  })
}

export function resumirBackup(backup: Backup): ResumoBackup {
  return resumirConteudo(backup.conteudo, backup.geradoEm)
}

function resumirConteudo(c: ConteudoBackup, geradoEm: Instante): ResumoBackup {
  return {
    geradoEm,
    viagens: resumirViagens(c),
    eventos: c.eventos.length,
    passageiros: c.passageiros.length,
    locais: c.locais.length,
    modelos: c.modelos.length,
  }
}

// ---------- Juntar com o que já está no celular ----------

export interface AvaliacaoViagem {
  viagem: ResumoViagem
  /** A viagem (mesmo id) já existe no celular. */
  existeNoCelular: boolean
  /** Eventos que o celular tem e o arquivo não: restaurar os apaga. */
  eventosAMaisNoCelular: number
  /** O celular tem registros que o arquivo não tem (mais eventos ou sequência maior). */
  celularMaisNovo: boolean
  /** Marcada de início, a menos que o celular esteja mais novo que o arquivo. */
  marcadaPorPadrao: boolean
}

/**
 * Para cada viagem do arquivo, diz se restaurá-la apaga registros do celular. Viagem que o
 * celular tem mais completa vem desmarcada, para não se perder dados por engano.
 */
export function avaliarViagensDoArquivo(arquivo: readonly ResumoViagem[], celular: readonly ResumoViagem[]): AvaliacaoViagem[] {
  return arquivo.map((v) => {
    const noCelular = celular.find((c) => c.id === v.id)
    const maisEventos = noCelular ? Math.max(0, noCelular.eventos - v.eventos) : 0
    const maisNovo = noCelular !== undefined && (noCelular.eventos > v.eventos || noCelular.ultimaSequencia > v.ultimaSequencia)
    return {
      viagem: v,
      existeNoCelular: noCelular !== undefined,
      eventosAMaisNoCelular: maisEventos,
      celularMaisNovo: maisNovo,
      marcadaPorPadrao: !maisNovo,
    }
  })
}

// ---------- Validação do arquivo ----------

type Verificador = (v: unknown) => string | null

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

const texto: Verificador = (v) => (typeof v === 'string' ? null : 'deveria ser texto')
const numero: Verificador = (v) => (typeof v === 'number' && Number.isFinite(v) ? null : 'deveria ser número')
const inteiro: Verificador = (v) => (Number.isInteger(v) ? null : 'deveria ser número inteiro')
const hora: Verificador = (v) => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? null : 'deveria ser HH:MM')
const horario: Verificador = (v) => {
  if (typeof v !== 'string') return 'deveria ser um horário completo'
  try {
    instante(v)
    return null
  } catch {
    return 'deveria ser um horário completo, com data e fuso'
  }
}
const listaDeTextos: Verificador = (v) => (Array.isArray(v) && v.every((x) => typeof x === 'string') ? null : 'deveria ser lista de textos')
const um = (...validos: string[]): Verificador => (v) => (typeof v === 'string' && validos.includes(v) ? null : `valor inesperado (${validos.join(', ')})`)
const ouNulo = (f: Verificador): Verificador => (v) => (v === null ? null : f(v))

type Campos = Record<string, Verificador>

/** Campos obrigatórios e opcionais de um registro; campo desconhecido é ignorado (versões futuras compatíveis). */
function conferir(valor: unknown, obrigatorios: Campos, opcionais: Campos = {}): string | null {
  if (!ehObjeto(valor)) return 'não é um registro'
  for (const [campo, f] of Object.entries(obrigatorios)) {
    if (!(campo in valor) || valor[campo] === undefined) return `falta o campo "${campo}"`
    const erro = f(valor[campo])
    if (erro) return `campo "${campo}": ${erro}`
  }
  for (const [campo, f] of Object.entries(opcionais)) {
    if (!(campo in valor) || valor[campo] === undefined) continue
    const erro = f(valor[campo])
    if (erro) return `campo "${campo}": ${erro}`
  }
  return null
}

const MOTIVOS_PARADA = ['pneu', 'policia', 'banheiro', 'cafe', 'passageiro_mal', 'acidente', 'transito_parado', 'outro']
const IMPREVISTOS = ['transito', 'acidente', 'problema_mecanico', 'passageiro', 'clima', 'atraso', 'outro']
const STATUS_PASSAGEIRO = ['ativo', 'nao_embarcou', 'saiu_da_viagem']

const planoOriginal: Verificador = (v) => {
  const erro = conferir(v, { congeladoEm: horario, etapas: (e) => (Array.isArray(e) ? null : 'deveria ser lista') })
  if (erro) return erro
  for (const e of (v as { etapas: unknown[] }).etapas) {
    const erroEtapa = conferir(e, { etapaId: texto, localId: ouNulo(texto), chegada: ouNulo(horario), saida: ouNulo(horario) })
    if (erroEtapa) return `etapa do plano original: ${erroEtapa}`
  }
  return null
}

const VIAGEM: [Campos, Campos] = [
  {
    id: texto,
    nome: texto,
    tipo: um('ida', 'volta'),
    dataSaida: horario,
    status: um('planejando', 'em_andamento', 'concluida'),
    fatorOnibus: numero,
    planoOriginal: ouNulo(planoOriginal),
  },
  { viagemRelacionadaId: texto, identificacao: texto, equipe: inteiro },
]

const ETAPA: [Campos, Campos] = [
  {
    id: texto,
    viagemId: texto,
    ordem: inteiro,
    tipo: um('origem', 'obrigatoria', 'flexivel', 'destino'),
    localId: ouNulo(texto),
    alternativas: listaDeTextos,
    permanenciaMin: numero,
  },
  { motivo: texto, categoria: texto, janelaInicio: horario, janelaFim: horario, chegadaRoteiro: horario, modoConferencia: um('todos_desceram', 'so_alguns') },
]

const LOCAL: [Campos, Campos] = [
  { id: texto, nome: texto, cidade: texto, tipo: texto, onibusPara: um('sim', 'nao', 'nao_sei') },
  {
    coordenadas: (v) => conferir(v, { lat: numero, lng: numero }),
    abre: hora,
    fecha: hora,
    telefone: texto,
    observacoes: texto,
    marcacao: um('favorito', 'evitar'),
  },
]

const TRECHO: [Campos, Campos] = [
  { etapaOrigemId: texto, localOrigemId: texto, etapaDestinoId: texto, localDestinoId: texto, duracaoMin: ouNulo(numero), fonte: um('rota', 'manual') },
  {
    distanciaKm: numero,
    calculadoEm: horario,
    rota: (v) => conferir(v, { duracaoMin: numero, distanciaKm: numero, calculadoEm: horario }),
  },
]

const PASSAGEIRO: [Campos, Campos] = [
  { id: texto, viagemId: texto, nome: texto, etapaEmbarqueId: texto, etapaDesembarqueId: ouNulo(texto), status: um(...STATUS_PASSAGEIRO) },
  {},
]

const MODELO: [Campos, Campos] = [{ id: um('atualizacao', 'restaurante'), texto, atualizadoEm: horario }, {}]

const EVENTO_BASE: [Campos, Campos] = [
  { id: texto, viagemId: texto, tipo: texto, horarioFato: horario, registradoEm: horario },
  { sequencia: inteiro, observacao: texto },
]

const DADOS_DO_EVENTO: Record<string, [Campos, Campos]> = {
  recalibracao: [{ horario }, {}],
  troca_local: [{ localId: texto }, {}],
  parada_nao_planejada: [{ fase: um('inicio', 'fim', 'previsao') }, { motivo: um(...MOTIVOS_PARADA), onde: texto, tempoPrevistoMin: numero }],
  imprevisto: [{ categoria: um(...IMPREVISTOS) }, {}],
  conferencia: [
    { modo: um('todos_desceram', 'so_alguns'), confirmados: listaDeTextos, pendentes: listaDeTextos, resultado: um('completa', 'completa_por_contagem', 'incompleta') },
    { momento: um('saida', 'volta'), motivo: texto },
  ],
  desceram: [{ local: um('etapa', 'nao_planejada'), passageiroIds: listaDeTextos }, {}],
  status_passageiro: [{ passageiroId: texto, status: um(...STATUS_PASSAGEIRO), motivo: texto }, {}],
  atualizacao_gerada: [{ previsaoDestino: ouNulo(horario), atrasoMin: ouNulo(numero) }, {}],
  observacao: [{ texto }, {}],
}
const EVENTOS_SEM_DADOS = ['inicio', 'fim', 'saida', 'chegada', 'pular_etapa']
const EVENTOS_COM_ETAPA = [
  'saida',
  'chegada',
  'pular_etapa',
  'recalibracao',
  'troca_local',
  'parada_nao_planejada',
  'conferencia',
  'desceram',
  'status_passageiro',
]

function erroDoEvento(e: unknown): string | null {
  const base = conferir(e, ...EVENTO_BASE)
  if (base) return base
  const ev = e as Record<string, unknown>
  const tipo = ev.tipo as string
  if (!EVENTOS_SEM_DADOS.includes(tipo) && !(tipo in DADOS_DO_EVENTO)) return `tipo de evento desconhecido (${tipo})`
  if (EVENTOS_COM_ETAPA.includes(tipo)) {
    const erro = texto(ev.etapaId)
    if (erro) return `campo "etapaId": ${erro}`
  }
  const dados = DADOS_DO_EVENTO[tipo]
  if (dados) {
    const erro = conferir(ev.dados, ...dados)
    if (erro) return `dados: ${erro}`
  }
  return null
}

function conferirLista(nome: string, lista: unknown, [obrigatorios, opcionais]: [Campos, Campos], chave: (r: never) => string, extra?: (r: never) => string | null): string | null {
  if (!Array.isArray(lista)) return `"${nome}" deveria ser uma lista`
  const vistos = new Set<string>()
  for (const [i, r] of lista.entries()) {
    const erro = conferir(r, obrigatorios, opcionais) ?? extra?.(r as never) ?? null
    if (erro) return `${nome}, item ${i + 1}: ${erro}`
    const k = chave(r as never)
    if (vistos.has(k)) return `${nome}, item ${i + 1}: identificador repetido`
    vistos.add(k)
  }
  return null
}

/** Estrutura, tipos e referências entre as listas. Devolve a primeira inconsistência, em português. */
function erroDoConteudo(c: unknown): string | null {
  if (!ehObjeto(c)) return 'o conteúdo não é um objeto'
  const listas = ['viagens', 'etapas', 'locais', 'trechos', 'eventos', 'passageiros', 'modelos'] as const
  for (const l of listas) if (!Array.isArray(c[l])) return `falta a lista "${l}"`
  const x = c as unknown as ConteudoBackup

  const erro =
    conferirLista('viagens', x.viagens, VIAGEM, (r: Viagem) => r.id) ??
    conferirLista('etapas', x.etapas, ETAPA, (r: Etapa) => r.id) ??
    conferirLista('locais', x.locais, LOCAL, (r: Local) => r.id) ??
    conferirLista('trechos', x.trechos, TRECHO, (r: Trecho) => [r.etapaOrigemId, r.localOrigemId, r.etapaDestinoId, r.localDestinoId].join('|')) ??
    conferirLista('eventos', x.eventos, [{}, {}], (r: Evento) => r.id, (r: Evento) => erroDoEvento(r)) ??
    conferirLista('passageiros', x.passageiros, PASSAGEIRO, (r: Passageiro) => r.id) ??
    conferirLista('modelos', x.modelos, MODELO, (r: ModeloSalvo) => r.id)
  if (erro) return erro

  const viagens = new Set(x.viagens.map((v) => v.id))
  const locais = new Set(x.locais.map((l) => l.id))
  const etapaDaViagem = new Map(x.etapas.map((e) => [e.id, e.viagemId]))
  const daViagem = (etapaId: string, viagemId: string) => etapaDaViagem.get(etapaId) === viagemId

  for (const e of x.etapas) {
    if (!viagens.has(e.viagemId)) return `etapa "${e.id}" aponta para uma viagem que não está no arquivo`
    for (const l of [e.localId, ...e.alternativas]) if (l !== null && !locais.has(l)) return `etapa "${e.id}" aponta para um local que não está no arquivo`
  }
  for (const v of x.viagens) {
    for (const o of v.planoOriginal?.etapas ?? []) {
      if (!daViagem(o.etapaId, v.id)) return `o plano original da viagem "${v.nome}" aponta para uma etapa que não está no arquivo`
      if (o.localId !== null && !locais.has(o.localId)) return `o plano original da viagem "${v.nome}" aponta para um local que não está no arquivo`
    }
  }
  for (const t of x.trechos) {
    if (!etapaDaViagem.has(t.etapaOrigemId) || !etapaDaViagem.has(t.etapaDestinoId)) return 'um trecho aponta para uma etapa que não está no arquivo'
    if (!locais.has(t.localOrigemId) || !locais.has(t.localDestinoId)) return 'um trecho aponta para um local que não está no arquivo'
  }
  for (const p of x.passageiros) {
    if (!viagens.has(p.viagemId)) return 'um passageiro aponta para uma viagem que não está no arquivo'
    if (!daViagem(p.etapaEmbarqueId, p.viagemId) || (p.etapaDesembarqueId !== null && !daViagem(p.etapaDesembarqueId, p.viagemId))) {
      return 'um passageiro aponta para uma etapa que não é da viagem dele'
    }
  }
  for (const e of x.eventos) {
    if (!viagens.has(e.viagemId)) return 'um evento aponta para uma viagem que não está no arquivo'
    if ('etapaId' in e && !daViagem(e.etapaId, e.viagemId)) return 'um evento aponta para uma etapa que não é da viagem dele'
  }
  return null
}

/**
 * Valida o texto do arquivo, na ordem: JSON, app, versão do formato, integridade, estrutura e
 * referências. Para no primeiro problema, com uma mensagem que a pessoa entende.
 */
export async function validarBackup(textoDoArquivo: string): Promise<ResultadoValidacao> {
  const recusa = (motivo: string): ResultadoValidacao => ({ ok: false, motivo })
  if (textoDoArquivo.length > TAMANHO_MAXIMO_CHARS) return recusa('O arquivo é grande demais para ser um backup do Bordo.')
  let bruto: unknown
  try {
    bruto = JSON.parse(textoDoArquivo)
  } catch {
    return recusa('Este arquivo não é um backup do Bordo (o conteúdo não pôde ser lido).')
  }
  if (!ehObjeto(bruto) || bruto.app !== APP_DO_BACKUP) return recusa('Este arquivo não é um backup do Bordo.')

  const formato = bruto.formato
  if (typeof formato !== 'number' || !Number.isInteger(formato) || formato < 1) return recusa('O arquivo não informa a versão do formato.')
  if (formato > FORMATO_ATUAL) return recusa('Este backup foi gerado por uma versão mais nova do Bordo. Atualize o app e tente de novo.')

  if (horario(bruto.geradoEm) !== null) return recusa('O arquivo não informa a data em que foi gerado.')
  const integridade = bruto.integridade
  if (!ehObjeto(integridade) || integridade.algoritmo !== 'SHA-256' || typeof integridade.hash !== 'string') {
    return recusa('O arquivo não traz a verificação de integridade.')
  }
  if (!ehObjeto(bruto.conteudo)) return recusa('O arquivo está sem conteúdo.')

  let calculado: string
  try {
    calculado = await hashDoConteudo(bruto.conteudo as unknown as ConteudoBackup)
  } catch (x) {
    return recusa(x instanceof Error ? x.message : 'Não foi possível verificar o arquivo.')
  }
  if (calculado !== integridade.hash) return recusa('O arquivo está corrompido ou foi alterado: a verificação de integridade não confere.')

  // Aqui entrariam as migrações de formatos antigos (formato < FORMATO_ATUAL). Hoje só existe o 1.
  const erro = erroDoConteudo(bruto.conteudo)
  if (erro) return recusa(`O arquivo está inconsistente: ${erro}.`)

  return { ok: true, backup: bruto as unknown as Backup }
}

// ---------- Lembrete ----------

export interface EstadoDoBackup {
  ultimo: UltimoBackup | null
  /** Registros (eventos) feitos depois do último backup; sem backup, todos os de hoje. */
  registrosDesde: number
  /** Horas desde o último backup; vazio sem backup. */
  horasDesde: number | null
  /** Passou de `backupAvisaDepoisDeHoras` ou de `backupAvisaDepoisDeRegistros` (ou nunca houve backup). */
  defasado: boolean
}

export function estadoDoBackup(ultimo: UltimoBackup | null, totalEventos: number, agora: Instante): EstadoDoBackup {
  const registrosDesde = ultimo ? Math.max(0, totalEventos - ultimo.totalEventos) : totalEventos
  const horasDesde = ultimo ? Math.max(0, diferencaMin(agora, ultimo.geradoEm) / 60) : null
  const defasado =
    ultimo === null ||
    (horasDesde ?? 0) >= CONFIG.backupAvisaDepoisDeHoras ||
    registrosDesde >= CONFIG.backupAvisaDepoisDeRegistros
  return { ultimo, registrosDesde, horasDesde, defasado }
}

/** A sugestão discreta da tela principal: backup defasado e "AGORA NÃO" não está valendo. */
export function deveSugerirBackup(estado: EstadoDoBackup, silencioAte: Instante | null, agora: Instante): boolean {
  if (!estado.defasado) return false
  return silencioAte === null || !antes(agora, silencioAte)
}

/**
 * Só sugere em momento de parada: parado numa etapa (ou aguardando a saída) ou logo depois de um
 * SAÍMOS (o último registro de percurso é a saída). Nunca durante uma parada não planejada e
 * nunca logo depois de CHEGAMOS ou PARAMOS.
 */
export function momentoDeSugerirBackup(situacao: Situacao, eventos: readonly Evento[]): boolean {
  if (situacao === 'aguardando_saida' || situacao === 'em_parada') return true
  if (situacao !== 'em_viagem') return false
  const ultimo = emOrdemDeGravacao(eventos).findLast((e) => ['saida', 'chegada', 'pular_etapa', 'parada_nao_planejada'].includes(e.tipo))
  return ultimo?.tipo === 'saida'
}
