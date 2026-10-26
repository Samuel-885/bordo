// Texto do relatório (fase 10b): transforma o `Relatorio` do núcleo num documento simples, de
// seções e blocos, que a prévia da tela e o PDF desenham do mesmo jeito. Nenhuma conta de
// horário ou de atraso aqui: tudo vem do núcleo; aqui só há rótulos, formatação e avisos.

import { aplicarInclusoes } from '../../core/inclusao'
import type { LinhaDeAtraso, LinhaDePermanencia, Marco, Ocorrencia, Relatorio, SituacaoDoPassageiro } from '../../core/relatorio'
import type { DadosPlano, Etapa, Evento, Instante } from '../../core/tipos'
import { dataHoraBr } from './backup'
import { formatarDuracao } from './duracao'
import { diasDepois, formatarData, formatarHora } from './horarios'
import { MOTIVOS_DE_PARADA, TIPOS_DE_IMPREVISTO, TODAS_AS_CATEGORIAS, rotuloDe } from './rotulos'
import { nomeDaEtapa } from './textos'

export type Bloco =
  | { tipo: 'texto'; texto: string; estilo?: 'aviso' | 'dica' }
  | { tipo: 'chaves'; linhas: Array<[string, string]> }
  | { tipo: 'tabela'; colunas: string[]; /** Larguras relativas. */ larguras: number[]; linhas: string[][] }
  | { tipo: 'lista'; itens: string[] }

export interface SecaoDoRelatorio {
  id: string
  titulo: string
  blocos: Bloco[]
}

export interface DocumentoDoRelatorio {
  titulo: string
  /** Linhas do cabeçalho (nome, tipo, data, identificação, equipe, status). */
  cabecalho: Array<[string, string]>
  avisos: string[]
  secoes: SecaoDoRelatorio[]
  /** "relatorio-viagem-AAAA-MM-DD.pdf". */
  nomeDoArquivo: string
}

export const AVISO_NOMES_NO_RELATORIO =
  'Com "Incluir nomes", o PDF passa a conter os nomes dos passageiros, que são dados pessoais (LGPD). Trate como confidencial: envie só a quem precisa e apague depois.'
export const AVISO_TEXTOS_LIVRES_NO_RELATORIO =
  'O motivo e o "onde" das paradas e o motivo das paradas incluídas são textos que você digitou e entram sempre no relatório. Se algum deles tiver nome de pessoa, o PDF também terá.'
export const AVISO_OBSERVACOES_NO_RELATORIO =
  'Com "Incluir observações", o texto das observações e das anotações dos imprevistos, que ficam só no celular, entra no PDF. Eles são textos digitados e podem conter nomes.'

const TRACO = '—'

/** "+17 min", "−5 min" ou "0 min" (sinal de menos de verdade). Sem tolerância: o relatório mostra o número exato. */
export function textoDaDiferenca(minutos: number | null): string {
  if (minutos === null) return TRACO
  const m = Math.round(minutos)
  if (m === 0) return '0 min'
  return `${m > 0 ? '+' : '−'}${formatarDuracao(Math.abs(m))}`
}

/** "08:25", ou "00:30 (dia 15)" quando é de outro dia que a saída da viagem. */
function horaNaViagem(i: Instante | null, base: Instante): string {
  if (!i) return TRACO
  const dias = diasDepois(i, base)
  return dias === 0 ? formatarHora(i) : `${formatarHora(i)} (dia ${Number(formatarData(i).slice(8, 10))})`
}

function dataBr(i: Instante): string {
  const [a, m, d] = formatarData(i).split('-')
  return `${d}/${m}/${a}`
}

const duracao = (m: number | null): string => (m === null ? TRACO : formatarDuracao(m))

export function montarDocumento(relatorio: Relatorio, plano: DadosPlano, eventos: readonly Evento[]): DocumentoDoRelatorio {
  const r = relatorio
  const efetivo = aplicarInclusoes(plano, eventos)
  const etapas = new Map<string, Etapa>(efetivo.etapas.map((e) => [e.id, e]))
  const localNome = (id: string | null): string => plano.locais.find((l) => l.id === id)?.nome ?? 'local não definido'
  const base = r.dataSaida
  const hora = (i: Instante | null) => horaNaViagem(i, base)

  const nomeDaEtapaCom = (etapaId: string): string => {
    const e = etapas.get(etapaId)
    const nome = nomeDaEtapa(e, plano.locais)
    return e?.motivo && !['origem', 'destino'].includes(e.tipo) ? `${nome} · ${e.motivo}` : nome
  }

  // ----- Cabeçalho e avisos -----
  const cabecalho: Array<[string, string]> = [
    ['Viagem', r.nome || 'Viagem'],
    ['Tipo', r.tipo === 'ida' ? 'Ida' : 'Volta'],
    ['Data', dataBr(r.dataSaida)],
    ...(r.identificacao ? ([['Identificação', r.identificacao]] as Array<[string, string]>) : []),
    ...(r.equipe ? ([['Equipe', `${r.equipe} ${r.equipe === 1 ? 'motorista ou responsável' : 'motoristas e responsáveis'}`]] as Array<[string, string]>) : []),
    ['Status', r.emAndamento ? 'Em andamento' : 'Concluída'],
    ['Gerado em', dataHoraBr(r.geradoEm)],
  ]
  const avisos: string[] = []
  if (r.emAndamento) avisos.push('Viagem em andamento: o relatório mostra só o que já aconteceu até agora.')
  if (r.restaurada) {
    avisos.push(
      `Viagem restaurada de um backup feito em ${dataHoraBr(r.restaurada.geradoEm)} (restaurada em ${dataHoraBr(r.restaurada.restauradoEm)}). O que aconteceu entre o backup e a restauração foi registrado depois, com horário corrigido.`,
    )
  }
  if (r.opcoes.incluirNomes) avisos.push(AVISO_NOMES_NO_RELATORIO)
  if (r.opcoes.incluirObservacoes) avisos.push(AVISO_OBSERVACOES_NO_RELATORIO)

  // ----- Resumo -----
  const s = r.resumo
  const resumo: Bloco[] = [
    {
      tipo: 'tabela',
      colunas: ['', 'Original', r.emAndamento ? 'Real / previsto' : 'Real'],
      larguras: [2, 2, 3],
      linhas: [
        ['Saída', hora(s.saidaOriginal), hora(s.saidaReal)],
        ['Chegada', hora(s.chegadaOriginal), s.chegadaReal ? hora(s.chegadaReal) : s.chegadaPrevista ? `${hora(s.chegadaPrevista)} (previsto)` : TRACO],
      ],
    },
    {
      tipo: 'chaves',
      linhas: [
        [r.emAndamento ? 'Atraso previsto no destino' : 'Atraso final', textoDaDiferenca(r.emAndamento ? s.atrasoPrevistoMin : s.atrasoFinalMin)],
        [s.duracaoParcial ? 'Duração até agora' : 'Duração total', duracao(s.duracaoTotalMin)],
        [
          'Quilometragem',
          s.quilometragem
            ? `${String(s.quilometragem.km).replace('.', ',')} km${
                s.quilometragem.trechosComDistancia === s.quilometragem.trechosTotais
                  ? ''
                  : ` (parcial: ${s.quilometragem.trechosComDistancia} de ${s.quilometragem.trechosTotais} trechos têm distância)`
              } · pela rota de carro, não é odômetro`
            : 'sem rota calculada',
        ],
      ],
    },
  ]

  // ----- Permanência nas paradas -----
  const linhaDePermanencia = (l: LinhaDePermanencia): string[] => {
    const nome =
      l.tipo === 'nao_planejada'
        ? `Não planejada: ${rotuloDe(MOTIVOS_DE_PARADA, l.motivo) || 'sem motivo'}${l.onde ? ` · ${l.onde}` : ''} (antes de ${nomeDaEtapaCom(l.etapaId)})`
        : `${nomeDaEtapaCom(l.etapaId)}${l.incluida ? ' (incluída)' : ''}`
    const saida = l.situacao === 'sem_saida' ? (l.tipo === 'nao_planejada' ? 'volta não registrada' : 'saída não registrada') : l.situacao === 'em_curso' ? 'parada agora' : hora(l.saida)
    return [nome, hora(l.chegada), saida, duracao(l.realMin), l.planejadoMin === null ? TRACO : duracao(l.planejadoMin), textoDaDiferenca(l.diferencaMin)]
  }
  const t = r.permanencias.totais
  const permanencia: Bloco[] = []
  if (r.permanencias.linhas.length === 0) {
    permanencia.push({ tipo: 'texto', texto: 'Nenhuma parada alcançada até agora.' })
  } else {
    permanencia.push({
      tipo: 'tabela',
      colunas: ['Parada', 'Chegada', 'Saída', 'Real', 'Planejado', 'Diferença'],
      larguras: [6, 2.2, 2.6, 1.6, 1.8, 1.8],
      linhas: r.permanencias.linhas.map(linhaDePermanencia),
    })
  }
  if (t.semSaida > 0) {
    permanencia.push({
      tipo: 'texto',
      estilo: 'aviso',
      texto: `${t.semSaida} ${t.semSaida === 1 ? 'parada ficou sem' : 'paradas ficaram sem'} saída (ou volta) registrada e ${t.semSaida === 1 ? 'não entra' : 'não entram'} nos totais. Corrija o horário na timeline para completar.`,
    })
  }
  if (t.emCurso > 0) permanencia.push({ tipo: 'texto', estilo: 'dica', texto: 'A parada em curso não entra nos totais.' })
  permanencia.push({
    tipo: 'chaves',
    linhas: [
      [`Total parado${t.completas > 0 ? ` (${t.completas} ${t.completas === 1 ? 'parada' : 'paradas'}, planejadas e não planejadas)` : ''}`, duracao(t.paradoMin)],
      [s.duracaoParcial ? 'Em movimento até agora (duração − parado)' : 'Em movimento (duração total − parado)', duracao(t.movimentoMin)],
    ],
  })
  permanencia.push({ tipo: 'texto', estilo: 'dica', texto: 'Os horários são os registrados, já com as correções feitas pela timeline.' })

  // ----- Onde o atraso nasceu -----
  const nomeDaLinha = (l: LinhaDeAtraso): string => {
    const nome = nomeDaEtapaCom(l.etapaId)
    const marcas: string[] = []
    if (l.incluida) marcas.push('incluída')
    if (l.pulada) marcas.push('pulada')
    if (l.localTrocado) marcas.push(`local trocado: ${localNome(l.localPlanejadoId)} → ${localNome(l.localRealId)}`)
    return marcas.length ? `${nome} (${marcas.join('; ')})` : nome
  }
  const par = (a: Marco | null, f: (m: Marco) => string): string => (a ? f(a) : TRACO)
  const duplo = (c: Marco | null, sa: Marco | null, f: (m: Marco) => string) => {
    const partes = [c, sa].filter((m): m is Marco => m !== null).map(f)
    return partes.every((x) => x === TRACO) ? TRACO : partes.join(' / ')
  }
  const atrasoLinhas = r.atraso.map((l) => [
    nomeDaLinha(l),
    par(l.chegada, (m) => hora(m.original)),
    par(l.chegada, (m) => hora(m.real)),
    par(l.saida, (m) => hora(m.original)),
    par(l.saida, (m) => hora(m.real)),
    l.pulada ? TRACO : duplo(l.chegada, l.saida, (m) => textoDaDiferenca(m.atrasoMin)),
    l.pulada ? TRACO : duplo(l.chegada, l.saida, (m) => textoDaDiferenca(m.variacaoMin)),
  ])
  const atraso: Bloco[] = [
    {
      tipo: 'tabela',
      colunas: ['Etapa', 'Cheg. orig.', 'Cheg. real', 'Saída orig.', 'Saída real', 'Atraso cheg. / saída', 'Variação trecho / parada'],
      larguras: [4.6, 1.5, 1.5, 1.5, 1.5, 2.5, 2.7],
      linhas: atrasoLinhas,
    },
    {
      tipo: 'texto',
      estilo: 'dica',
      texto:
        'Atraso = horário real menos o original do mesmo evento. Variação = quanto o atraso cresceu (+) ou diminuiu (−) no trecho até a chegada e na parada. Paradas não planejadas e imprevistos estão dentro da variação do trecho em que ocorreram. ' +
        'Parada incluída em viagem não tem original: o trecho até ela fica sem variação e toda a permanência conta como variação; o trecho seguinte leva a diferença para o roteiro original.',
    },
  ]

  // ----- Ocorrências -----
  const textoDaOcorrencia = (o: Ocorrencia): string => {
    const quando = `${hora(o.horario)} — `
    switch (o.tipo) {
      case 'parada_nao_planejada':
        return `${quando}Parada não planejada: ${rotuloDe(MOTIVOS_DE_PARADA, o.motivo) || 'sem motivo'}${o.onde ? ` · ${o.onde}` : ''} · ${
          o.aberta ? 'em andamento ou sem volta registrada' : `durou ${duracao(o.realMin)}`
        }${o.previstoMin !== null ? ` (previsto ${duracao(o.previstoMin)})` : ''}`
      case 'imprevisto':
        return `${quando}Imprevisto: ${rotuloDe(TIPOS_DE_IMPREVISTO, o.categoria)}${o.texto ? ` · ${o.texto}` : o.texto === null ? ' (anotação não incluída)' : ''}`
      case 'observacao':
        return `${quando}Observação${o.texto === null ? ' (texto não incluído)' : `: ${o.texto}`}`
      case 'troca_local':
        return `${quando}Local trocado em ${nomeDaEtapaCom(o.etapaId)}: ${localNome(o.deLocalId)} → ${localNome(o.paraLocalId)}`
      case 'local_novo':
        return `${quando}Local novo em ${nomeDaEtapaCom(o.etapaId)}: ${localNome(o.localId)}${o.trocado ? ' (já trocado para ele)' : ''}`
      case 'parada_incluida':
        return `${quando}Parada incluída: ${rotuloDe(TODAS_AS_CATEGORIAS, o.categoria) || 'parada'} em ${localNome(o.localId)}${o.motivo ? ` · ${o.motivo}` : ''}, depois de ${nomeDaEtapaCom(o.apos)} (${duracao(o.permanenciaMin)} planejados)`
      case 'inclusao_cancelada':
        return `${quando}Parada incluída cancelada${o.localId ? `: ${localNome(o.localId)}` : ''}`
      case 'etapa_pulada':
        return `${quando}Etapa pulada: ${nomeDaEtapaCom(o.etapaId)}`
    }
  }
  const ocorrencias: Bloco[] =
    r.ocorrencias.length === 0 ? [{ tipo: 'texto', texto: 'Nenhuma ocorrência registrada.' }] : [{ tipo: 'lista', itens: r.ocorrencias.map(textoDaOcorrencia) }]

  // ----- Comunicação -----
  const c = r.comunicacao
  const comunicacao: Bloco[] = [
    c.mensagens.length === 0
      ? { tipo: 'texto', texto: 'Nenhuma mensagem de atualização gerada.' }
      : {
          tipo: 'lista',
          itens: c.mensagens.map(
            (m) => `${hora(m.horario)} — Mensagem de atualização${m.previsaoDestino ? `: destino previsto ${hora(m.previsaoDestino)}` : ''}${m.atrasoMin !== null ? `, atraso informado ${textoDaDiferenca(m.atrasoMin)}` : ''}`,
          ),
        },
    {
      tipo: 'texto',
      texto: `Atualizações de previsão: ${c.atualizacoes.digitadas} digitadas (Google Maps), ${c.atualizacoes.pelaLocalizacao} pelo botão de localização e ${c.atualizacoes.automaticas} automáticas.`,
    },
    { tipo: 'texto', estilo: 'dica', texto: 'O texto das mensagens não é guardado nem entra no relatório.' },
  ]

  // ----- Passageiros -----
  const p = r.passageiros.contagem
  const passageiros: Bloco[] = [
    {
      tipo: 'chaves',
      linhas: [
        ['Cadastrados', String(p.cadastrados)],
        ['Conferidos (nomeados em alguma conferência)', String(p.conferidos)],
        ['Conferências feitas', `${p.conferencias.total} (${p.conferencias.completas} completas, ${p.conferencias.porContagem} por contagem, ${p.conferencias.incompletas} incompletas)`],
        ['Desceram no caminho (marcados em "Quem desceu")', String(p.desceram)],
        ['Não embarcaram', String(p.naoEmbarcaram)],
        ['Saíram da viagem', String(p.sairamDaViagem)],
        ['Chegaram ao destino', p.chegaram === null ? 'viagem ainda não chegou' : String(p.chegaram)],
      ],
    },
  ]
  const situacao: Record<SituacaoDoPassageiro, string> = {
    chegou: 'chegou',
    desceu: 'desceu no caminho',
    nao_embarcou: 'não embarcou',
    saiu_da_viagem: 'saiu da viagem',
    em_viagem: 'em viagem',
  }
  if (r.passageiros.lista) {
    passageiros.push({
      tipo: 'tabela',
      colunas: ['Nome', 'Embarque', 'Desembarque', 'Situação'],
      larguras: [4, 3, 3, 2.4],
      linhas: r.passageiros.lista.map((x) => [
        x.nome,
        nomeDaEtapaCom(x.etapaEmbarqueId),
        x.etapaDesembarqueId ? nomeDaEtapaCom(x.etapaDesembarqueId) : 'Destino',
        situacao[x.situacao],
      ]),
    })
  } else {
    passageiros.push({ tipo: 'texto', estilo: 'dica', texto: 'Sem nomes: só as contagens.' })
  }

  return {
    titulo: 'Relatório da viagem',
    cabecalho,
    avisos,
    secoes: [
      { id: 'resumo', titulo: 'Resumo', blocos: resumo },
      { id: 'permanencia', titulo: 'Permanência nas paradas', blocos: permanencia },
      { id: 'atraso', titulo: 'Onde o atraso nasceu', blocos: atraso },
      { id: 'ocorrencias', titulo: 'Ocorrências', blocos: ocorrencias },
      { id: 'comunicacao', titulo: 'Comunicação', blocos: comunicacao },
      { id: 'passageiros', titulo: 'Passageiros', blocos: passageiros },
    ],
    nomeDoArquivo: `relatorio-viagem-${formatarData(r.dataSaida)}.pdf`,
  }
}
