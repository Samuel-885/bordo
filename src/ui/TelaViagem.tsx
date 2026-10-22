// Tela principal da viagem. Responde em segundos: onde estamos, próxima etapa, quanto
// falta, previsão e atraso. Nenhuma regra aqui: a situação, as travas e o cálculo vêm do
// núcleo; os registros passam pelo repositório.

import { useEffect, useState } from 'react'
import { classificarAtraso } from '../core/atraso'
import {
  contextoDeDescidaNaEtapa,
  contextoDeDescidaNaoPlanejada,
  contextoDeSaida,
  contextoDeVolta,
  descidaParaConferencia,
  marcacaoDeDescida,
  oferecerDescidaAoChegar,
  resumoABordo,
  type ContextoDeDescida,
  type DecisaoDePendente,
  type EstadoConferencia,
} from '../core/conferencia'
import { pendenciasDeRegistro, validarPulo } from '../core/previsao'
import { temAlternativasPendentes } from '../core/viabilidade'
import { validarRecalibracao } from '../core/recalibracao'
import { situacaoDaViagem } from '../core/registro'
import { ordenarEtapas } from '../core/trechos'
import type { ConteudoEvento } from '../core/eventos'
import type { IdModelo } from '../core/modelos'
import type { Evento, Instante, Local, MotivoParada, Passageiro, TipoImprevisto } from '../core/tipos'
import type { Repositorio, ResultadoRegistro } from '../data/repositorio'
import { AvisoDesfazer } from './componentes/AvisoDesfazer'
import { CampoHora } from './componentes/CampoHora'
import { Conferencia } from './Conferencia'
import { FolhaQuemDesceu } from './FolhaQuemDesceu'
import { Confirmar } from './componentes/Confirmar'
import { FolhaDadosDaViagem } from './componentes/FolhaDadosDaViagem'
import { FolhaMensagem } from './componentes/FolhaMensagem'
import { Hora } from './componentes/Hora'
import { Topo } from './componentes/Topo'
import { FolhaHorario, FolhaImprevisto, FolhaObservacao, FolhaParada, FolhaRecalibracao } from './Folhas'
import { resolverHorarioPassado } from './logica/horarioDigitado'
import { formatarHora } from './logica/horarios'
import { linkGoogleMaps } from './logica/linkMaps'
import { gerarMensagem, previsaoInformada, valoresDaAtualizacao } from './logica/mensagens'
import { nomeDaEtapa } from './logica/textos'
import {
  nomeDaEtapaEmUso,
  textoDaOrigemDaPrevisao,
  textoABordo,
  textoDaSituacao,
  textoDoAtraso,
  textoDoCronometro,
  textoDoTempoRestante,
  formatarDuracaoCurta,
} from './logica/textosViagem'
import { useAgora, useAoMudar } from './useAgora'
import { useDados } from './useDados'
import { useVoltarFecha } from './useVoltarFecha'
import { mensagemDeErroDoBanco } from '../data/avisoBanco'

const JANELA_DESFAZER_MS = 8000

interface Props {
  repo: Repositorio
  viagemId: string
  onVoltar: () => void
  onTimeline: () => void
  onPassageiros: () => void
  onAlternativas: () => void
  onModelos: () => void
  /** A demonstração usa para sair do cenário e entrar no modo livre. */
  aoRegistrar?: () => void
}

type Acao = 'parada' | 'imprevisto' | 'recalibracao' | 'volta' | 'pular' | 'oferta' | 'observacao' | null

export function TelaViagem({ repo, viagemId, onVoltar, onTimeline, onPassageiros, onAlternativas, onModelos, aoRegistrar }: Props) {
  const { dados, erro, recarregar } = useDados(async () => {
    const [plano, eventos, passageiros, modelos] = await Promise.all([
      repo.carregarPlano(viagemId),
      repo.listarEventos(viagemId),
      repo.listarPassageiros(viagemId),
      repo.obterModelos(),
    ])
    return { plano, eventos, passageiros, modelos }
  }, `${repo.espaco}:${viagemId}`)
  useAoMudar(recarregar)
  const agora = useAgora()

  if (erro) {
    return (
      <>
        <Topo titulo="Viagem" onVoltar={onVoltar} rotuloVoltar="Voltar às viagens" />
        <main className="conteudo"><p className="msg-erro">{erro}</p></main>
      </>
    )
  }
  if (!dados) return <Topo titulo="Viagem" onVoltar={onVoltar} rotuloVoltar="Voltar às viagens" />
  if (!dados.plano || !dados.plano.viagem.planoOriginal) {
    return (
      <>
        <Topo titulo="Viagem" onVoltar={onVoltar} rotuloVoltar="Voltar às viagens" />
        <main className="conteudo"><p className="msg-erro">Viagem não encontrada ou ainda não iniciada.</p></main>
      </>
    )
  }
  return (
    <Conteudo
      repo={repo}
      plano={dados.plano}
      eventos={dados.eventos}
      passageiros={dados.passageiros}
      modelos={dados.modelos}
      agora={agora}
      recarregar={recarregar}
      onVoltar={onVoltar}
      onTimeline={onTimeline}
      onPassageiros={onPassageiros}
      onAlternativas={onAlternativas}
      onModelos={onModelos}
      aoRegistrar={aoRegistrar}
    />
  )
}

interface ConteudoProps {
  repo: Repositorio
  plano: NonNullable<Awaited<ReturnType<Repositorio['carregarPlano']>>>
  eventos: Evento[]
  passageiros: Passageiro[]
  modelos: Record<IdModelo, string | null>
  agora: Instante
  recarregar: () => void
  onVoltar: () => void
  onTimeline: () => void
  onPassageiros: () => void
  onAlternativas: () => void
  onModelos: () => void
  aoRegistrar?: () => void
}

function Conteudo({ repo, plano, eventos, passageiros, modelos, agora, recarregar, onVoltar, onTimeline, onPassageiros, onAlternativas, onModelos, aoRegistrar }: ConteudoProps) {
  const { viagem, etapas, locais } = plano
  const original = viagem.planoOriginal!
  const s = situacaoDaViagem(plano, original, eventos, agora)
  const ordenadas = ordenarEtapas(etapas)
  const etapaDe = (id: string | null) => etapas.find((e) => e.id === id)
  const estadoDe = (id: string | null) => s.estado.etapas.find((e) => e.etapaId === id)
  const localDe = (id: string | null): Local | undefined => locais.find((l) => l.id === (estadoDe(id)?.localId ?? null))
  const nome = (id: string | null) => nomeDaEtapaEmUso(etapaDe(id), locais, eventos)

  const [acao, setAcao] = useState<Acao>(null)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [desfazer, setDesfazer] = useState<{ ids: string[]; texto: string } | null>(null)
  const [horaPendente, setHoraPendente] = useState('')
  /** A conferência aberta: na saída de uma etapa ou na volta à estrada (a próxima etapa). */
  const [conferindo, setConferindo] = useState<{ momento: 'saida' | 'volta'; etapaId: string } | null>(null)
  useVoltarFecha(conferindo !== null, () => setConferindo(null))
  /** A folha "Quem desceu?": aberta sozinha (CHEGAMOS, PARAMOS) ou pelo botão do cartão. */
  const [descida, setDescida] = useState<{ local: 'etapa' | 'nao_planejada'; etapaId: string; automatica: boolean } | null>(null)

  /** A prévia da mensagem de atualização e a folha de identificação e equipe. */
  const [previa, setPrevia] = useState(false)
  const [dadosAbertos, setDadosAbertos] = useState(false)

  useEffect(() => {
    if (!desfazer) return
    const t = setTimeout(() => setDesfazer(null), JANELA_DESFAZER_MS)
    return () => clearTimeout(t)
  }, [desfazer])

  const abrir = (a: Acao) => {
    setErro(null)
    setAcao(a)
  }
  const fechar = () => {
    setErro(null)
    setAcao(null)
  }

  /** Executa um registro; em sucesso, mostra o aviso com DESFAZER e recarrega. */
  async function registrar(fazer: () => Promise<ResultadoRegistro>, texto: string): Promise<boolean> {
    setOcupado(true)
    setErro(null)
    try {
      const r = await fazer()
      if (!r.ok) {
        setErro(r.motivo)
        return false
      }
      aoRegistrar?.()
      setDesfazer({ ids: r.eventos.map((e) => e.id), texto })
      recarregar()
      return true
    } catch (x) {
      setErro(mensagemDeErroDoBanco(x, 'Não foi possível registrar.'))
      return false
    } finally {
      setOcupado(false)
    }
  }

  const registrarConteudo = (c: ConteudoEvento, texto: string, opcoes?: Parameters<Repositorio['registrarEvento']>[2]) =>
    registrar(() => repo.registrarEvento(viagem.id, c, opcoes), texto)

  async function desfazerUltimo() {
    if (!desfazer) return
    const { ids } = desfazer
    setDesfazer(null)
    const r = await repo.desfazerRegistro(viagem.id, ids)
    if (!r.ok) setErro(r.motivo)
    recarregar()
  }

  // ---------- Botões ----------

  /** Todo SAÍMOS passa pela conferência. Sem passageiros cadastrados, grava a saída direto. */
  const aoSair = async (etapaId: string) => {
    if (passageiros.length === 0) {
      await registrarConteudo({ tipo: 'saida', etapaId }, `Saída registrada às ${formatarHora(agora)}.`)
      return
    }
    setErro(null)
    setConferindo({ momento: 'saida', etapaId })
  }
  /** VOLTAMOS depois de uma parada não planejada também passa pela conferência (modo "só alguns"). */
  const aoVoltar = async (etapaId: string) => {
    if (passageiros.length === 0) {
      await registrarConteudo(
        { tipo: 'parada_nao_planejada', etapaId, dados: { fase: 'fim' } },
        `VOLTAMOS registrado às ${formatarHora(agora)}.`,
      )
      return
    }
    setErro(null)
    setConferindo({ momento: 'volta', etapaId })
  }
  async function confirmarConferencia(estado: EstadoConferencia, decisoes: DecisaoDePendente[]) {
    if (!conferindo) return
    const contexto =
      conferindo.momento === 'saida'
        ? contextoDeSaida(conferindo.etapaId, plano, passageiros, eventos)
        : contextoDeVolta(conferindo.etapaId, plano, passageiros, eventos)
    const ok =
      conferindo.momento === 'saida'
        ? await registrar(
            () => repo.registrarSaidaComConferencia(viagem.id, conferindo.etapaId, { contexto, estado, decisoes }),
            `Saída registrada às ${formatarHora(agora)}.`,
          )
        : await registrar(
            () => repo.registrarVoltaComConferencia(viagem.id, { contexto, estado, decisoes }),
            `VOLTAMOS registrado às ${formatarHora(agora)}.`,
          )
    if (ok) setConferindo(null)
  }
  const aoChegar = async (etapaId: string) => {
    const ok = await registrar(() => repo.registrarChegada(viagem.id, etapaId), `Chegada registrada às ${formatarHora(agora)}.`)
    if (ok) oferecerDescida('etapa', etapaId)
  }

  /** Abre "Quem desceu?" sozinha, se há alguém a bordo naquele ponto e a etapa não é refeição nem destino. */
  function oferecerDescida(local: 'etapa' | 'nao_planejada', etapaId: string) {
    if (passageiros.length === 0) return
    const etapaDaParada = etapaDe(etapaId)
    if (local === 'etapa' && (!etapaDaParada || !oferecerDescidaAoChegar(etapaDaParada))) return
    if (contextoDeDescida(local, etapaId).aBordo.length === 0) return
    setErro(null)
    setDescida({ local, etapaId, automatica: true })
  }

  function contextoDeDescida(local: 'etapa' | 'nao_planejada', etapaId: string): ContextoDeDescida {
    return local === 'etapa'
      ? contextoDeDescidaNaEtapa(etapaId, plano, passageiros, eventos)
      : contextoDeDescidaNaoPlanejada(etapaId, plano, passageiros, eventos)
  }

  async function salvarDescida(passageiroIds: string[]) {
    if (!descida) return
    const { local, etapaId } = descida
    const ok = await registrarConteudo(
      { tipo: 'desceram', etapaId, dados: { local, passageiroIds } },
      passageiroIds.length === 1 ? '1 passageiro marcado como desceu.' : `${passageiroIds.length} passageiros marcados como desceram.`,
    )
    if (ok) setDescida(null)
  }

  /** Grava na timeline que uma atualização foi gerada (só o horário e a previsão informada, nunca o texto). */
  async function registrarAtualizacaoGerada() {
    try {
      const r = await repo.registrarEvento(viagem.id, { tipo: 'atualizacao_gerada', dados: previsaoInformada(plano, eventos, agora) })
      if (!r.ok) setErro(r.motivo)
      recarregar()
    } catch (x) {
      setErro(mensagemDeErroDoBanco(x, 'Não foi possível registrar a atualização na timeline.'))
    }
  }

  async function salvarDados(dados: { identificacao: string; equipe: number }) {
    setOcupado(true)
    setErro(null)
    try {
      await repo.salvarViagem({ ...viagem, identificacao: dados.identificacao, equipe: dados.equipe })
      setDadosAbertos(false)
      recarregar()
    } catch (x) {
      setErro(mensagemDeErroDoBanco(x, 'Não foi possível salvar.'))
    } finally {
      setOcupado(false)
    }
  }

  const proxima = s.proximaEtapaId
  const proximaEtapa = etapaDe(proxima)
  const mapa = linkGoogleMaps(localDe(proxima))
  const podeRecalibrar =
    proxima !== null &&
    s.situacao !== 'chegamos' &&
    validarRecalibracao(plano, original, eventos, proxima, agora, agora).ok
  const podePular = proxima !== null && proximaEtapa?.tipo === 'flexivel' && validarPulo(plano, s.estado, proxima).ok
  const pendencia = pendenciasDeRegistro(plano, eventos)[0] ?? null
  const concluida = s.situacao === 'chegamos'

  const primeira = ordenadas[0]
  const ultima = ordenadas.at(-1)
  const cidadeDe = (id: string | undefined) => {
    const l = locais.find((x) => x.id === (id ? (estadoDe(id)?.localId ?? etapaDe(id)?.localId) : null))
    return l?.cidade || l?.nome || '—'
  }

  const destino = s.estado.chegadaDestino
  const destinoOriginal = original.etapas.find((o) => o.etapaId === ultima?.id)?.chegada ?? null
  const atraso = s.estado.atrasoDestinoMin
  const classe = atraso === null ? null : classificarAtraso(atraso)

  const nomeLocalParado = s.etapaAtualId ? nome(s.etapaAtualId) : null
  const estadoProxima = estadoDe(proxima)
  const chegadaProxima = estadoProxima?.chegada ?? null
  const saidaOrigem = estadoDe(primeira?.id ?? null)?.saida ?? null
  const aBordo = resumoABordo(plano, passageiros, eventos, s)

  /** "Marcar quem desceu" no cartão da parada: marca ou corrige a qualquer momento. */
  function botaoMarcarDescida(local: 'etapa' | 'nao_planejada', etapaId: string) {
    if (passageiros.length === 0 || contextoDeDescida(local, etapaId).aBordo.length === 0) return null
    const marcados = marcacaoDeDescida(eventos, local, etapaId)
    return (
      <>
        {marcados !== null && <p className="dica">Desceram: {marcados.length}</p>}
        <button type="button" className="botao pequeno largo" disabled={ocupado} onClick={() => { setErro(null); setDescida({ local, etapaId, automatica: false }) }}>
          Marcar quem desceu
        </button>
      </>
    )
  }

  if (conferindo) {
    const contexto =
      conferindo.momento === 'saida'
        ? contextoDeSaida(conferindo.etapaId, plano, passageiros, eventos)
        : contextoDeVolta(conferindo.etapaId, plano, passageiros, eventos)
    const etapaConferida = etapaDe(conferindo.etapaId)
    return (
      <Conferencia
        key={`${conferindo.momento}-${conferindo.etapaId}`}
        contexto={contexto}
        etapa={etapaConferida ?? { tipo: 'obrigatoria' }}
        etapas={etapas}
        titulo={conferindo.momento === 'saida' ? `Saída de ${nome(conferindo.etapaId)}` : 'Volta à estrada'}
        rotuloSair={conferindo.momento === 'saida' ? 'SAÍMOS' : 'VOLTAMOS'}
        desceram={descidaParaConferencia(contexto, eventos)}
        ocupado={ocupado}
        erro={erro}
        onConfirmar={(estado, decisoes) => void confirmarConferencia(estado, decisoes)}
        onFechar={() => setConferindo(null)}
      />
    )
  }

  return (
    <>
      <Topo
        titulo={viagem.nome || 'Viagem'}
        onVoltar={onVoltar}
        rotuloVoltar="Voltar às viagens"
        direita={
          <button type="button" className="botao-topo" onClick={onTimeline}>
            Timeline
          </button>
        }
      />
      <main className="conteudo viagem">
        <section className="cartao situacao" aria-label="Situação">
          <p className="rota">
            {cidadeDe(primeira?.id)} → {cidadeDe(ultima?.id)}
          </p>
          <p className="estado-viagem">{textoDaSituacao(s.situacao, nomeLocalParado)}</p>
        </section>

        <section className={`cartao previsao ${classe?.situacao === 'atrasado' ? 'atencao' : ''}`} aria-label="Previsão no destino">
          <div className="duas-colunas">
            <div>
              <h2>Previsão original</h2>
              {destinoOriginal ? <Hora instante={destinoOriginal} agora={agora} /> : <span>—</span>}
            </div>
            <div>
              <h2>{concluida ? 'Chegada real' : 'Previsão atual'}</h2>
              {destino ? <Hora instante={destino.instante} agora={agora} /> : <span>sem tempo definido</span>}
            </div>
          </div>
          {classe && (
            <p className={`atraso ${classe.situacao}`} aria-live="polite">
              {classe.situacao === 'no_horario' ? 'No horário' : textoDoAtraso(classe.minutos)}
              {classe.situacao === 'no_horario' && classe.minutos !== 0 ? ` (${classe.minutos > 0 ? '+' : '−'}${Math.abs(classe.minutos)} min)` : ''}
            </p>
          )}
          {concluida && <p className="dica">Viagem encerrada. O relatório completo chega na fase 10.</p>}
        </section>

        {s.situacao === 'aguardando_saida' && saidaOrigem && (
          <section className="cartao" aria-label="Saída">
            <h2>Saída prevista</h2>
            <p className="linha-grande">
              <Hora instante={saidaOrigem.instante} agora={agora} />
              {saidaOrigem.atrasoMin !== null && saidaOrigem.atrasoMin !== 0 && (
                <span className="suave"> · {textoDoAtraso(saidaOrigem.atrasoMin)}</span>
              )}
            </p>
          </section>
        )}

        {s.cronometro && (
          <section className={`cartao ${s.cronometro.excedeuMin > 0 ? 'atencao' : ''}`} aria-label="Cronômetro da parada">
            <h2>Parada em {nome(s.etapaAtualId)}</h2>
            <p className="cronometro">{textoDoCronometro(s.cronometro)}</p>
            <p className="dica">
              Planejado {formatarDuracaoCurta(s.cronometro.planejadoMin)} · decorrido {formatarDuracaoCurta(s.cronometro.decorridoMin)}
            </p>
            {botaoMarcarDescida('etapa', s.cronometro.etapaId)}
          </section>
        )}

        {s.paradaNaoPlanejada && (
          <section className="cartao atencao" aria-label="Parada não planejada">
            <h2>Parada não planejada</h2>
            <p className="cronometro">parados há {formatarDuracaoCurta(s.paradaNaoPlanejada.decorridoMin)}</p>
            <p className="dica">Desde as {formatarHora(s.paradaNaoPlanejada.inicio)}.</p>
            {botaoMarcarDescida('nao_planejada', s.paradaNaoPlanejada.etapaId)}
          </section>
        )}

        {proxima && proximaEtapa && !concluida && (
          <section className="cartao" aria-label="Próxima etapa">
            <h2>Próxima etapa</h2>
            <p className="linha-grande">{nomeDaEtapa(proximaEtapa, locais)}</p>
            {(localDe(proxima)?.nome ?? 'Local não escolhido') !== nomeDaEtapa(proximaEtapa, locais) && (
              <p className="suave">{localDe(proxima)?.nome ?? 'Local não escolhido'}</p>
            )}
            {chegadaProxima ? (
              <>
                <p className="linha">
                  Chegada estimada <Hora instante={chegadaProxima.instante} agora={agora} />
                  <span className="suave"> · falta {textoDoTempoRestante(chegadaProxima.instante, agora)}</span>
                </p>
                {textoDaOrigemDaPrevisao(chegadaProxima) && <p className="dica">{textoDaOrigemDaPrevisao(chegadaProxima)}</p>}
              </>
            ) : (
              <p className="dica">Sem tempo definido para este trecho.</p>
            )}
          </section>
        )}

        {aBordo && (
          <button type="button" className="cartao a-bordo" onClick={onPassageiros}>
            <h2>A bordo</h2>
            <span className="linha-grande">{textoABordo(aBordo)}</span>
          </button>
        )}

        {!concluida && (
          <button type="button" className="botao largo" onClick={() => { setErro(null); setPrevia(true) }}>
            GERAR ATUALIZAÇÃO
          </button>
        )}

        {erro && acao === null && <p className="msg-erro" role="alert">{erro}</p>}

        {pendencia && !concluida ? (
          <section className="cartao atencao" aria-label="Registro esquecido">
            <h2>Falta um horário</h2>
            <p>
              {pendencia.momento === 'chegada' ? 'Chegada em' : 'Saída de'} {nome(pendencia.etapaId)} não foi registrada. A que horas foi?
            </p>
            <CampoHora
              id="pendencia-hora"
              rotulo="Horário"
              valor={horaPendente}
              onMudar={setHoraPendente}
              resolvido={resolverHorarioPassado(horaPendente, agora)}
              agora={agora}
            />
            <button
              type="button"
              className="botao principal largo"
              disabled={ocupado || resolverHorarioPassado(horaPendente, agora) === null}
              onClick={async () => {
                const quando = resolverHorarioPassado(horaPendente, agora)
                if (!quando) return
                const ok = await registrar(() => repo.registrarPendencia(viagem.id, pendencia.etapaId, pendencia.momento, quando), 'Horário registrado.')
                if (ok) setHoraPendente('')
              }}
            >
              Registrar horário
            </button>
          </section>
        ) : (
          !concluida && (
            <>
              {s.situacao === 'aguardando_saida' || s.situacao === 'em_parada' ? (
                <button type="button" className="botao-principal" disabled={ocupado} onClick={() => s.etapaAtualId && void aoSair(s.etapaAtualId)}>
                  SAÍMOS
                </button>
              ) : s.situacao === 'em_viagem' ? (
                <button type="button" className="botao-principal" disabled={ocupado} onClick={() => proxima && void aoChegar(proxima)}>
                  CHEGAMOS
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="botao-principal"
                    disabled={ocupado}
                    onClick={() => s.paradaNaoPlanejada && void aoVoltar(s.paradaNaoPlanejada.etapaId)}
                  >
                    VOLTAMOS
                  </button>
                  <button type="button" className="botao largo" disabled={ocupado} onClick={() => abrir('volta')}>
                    CHEGAMOS (sem registrar a volta antes)
                  </button>
                </>
              )}

              <div className="secundarias">
                {mapa && (
                  <a className="botao link-botao" href={mapa} target="_blank" rel="noopener noreferrer">
                    ABRIR NO GOOGLE MAPS
                  </a>
                )}
                {podeRecalibrar && (
                  <button type="button" className="botao" onClick={() => abrir('recalibracao')}>
                    ATUALIZAR PREVISÃO
                  </button>
                )}
                {s.situacao === 'em_viagem' && (
                  <button type="button" className="botao" onClick={() => abrir('parada')}>
                    PARAMOS
                  </button>
                )}
                <button type="button" className="botao" onClick={() => abrir('imprevisto')}>
                  REGISTRAR IMPREVISTO
                </button>
                <button type="button" className="botao" onClick={() => abrir('observacao')}>
                  OBSERVAÇÃO
                </button>
                <button type="button" className="botao" onClick={onPassageiros}>
                  PASSAGEIROS
                </button>
                {temAlternativasPendentes(plano, s.estado) && (
                  <button type="button" className="botao" onClick={onAlternativas}>
                    VER ALTERNATIVAS
                  </button>
                )}
                {podePular && (
                  <button type="button" className="botao" onClick={() => abrir('pular')}>
                    PULAR ETAPA
                  </button>
                )}
              </div>
            </>
          )
        )}
      </main>

      {desfazer && <AvisoDesfazer texto={desfazer.texto} onDesfazer={() => void desfazerUltimo()} />}

      {descida && (
        <FolhaQuemDesceu
          key={`${descida.local}-${descida.etapaId}`}
          aBordo={contextoDeDescida(descida.local, descida.etapaId).aBordo}
          atual={marcacaoDeDescida(eventos, descida.local, descida.etapaId)}
          automatica={descida.automatica}
          ocupado={ocupado}
          erro={erro}
          onSalvar={(ids) => void salvarDescida(ids)}
          onFechar={() => setDescida(null)}
        />
      )}

      {previa && (
        <FolhaMensagem
          titulo="Mensagem de atualização"
          gerar={() => gerarMensagem('atualizacao', modelos.atualizacao, valoresDaAtualizacao(plano, eventos, passageiros, agora))}
          chave={`${viagem.identificacao ?? ''}|${viagem.equipe ?? 0}`}
          aoUsar={registrarAtualizacaoGerada}
          onEditarModelo={() => { setPrevia(false); onModelos() }}
          onDados={() => { setErro(null); setDadosAbertos(true) }}
          onFechar={() => setPrevia(false)}
        />
      )}

      {dadosAbertos && (
        <FolhaDadosDaViagem
          viagem={viagem}
          ocupado={ocupado}
          erro={erro}
          onSalvar={(d) => void salvarDados(d)}
          onCancelar={() => { setErro(null); setDadosAbertos(false) }}
        />
      )}

      {acao === 'observacao' && (
        <FolhaObservacao
          aberta
          ocupado={ocupado}
          erro={erro}
          agora={agora}
          onCancelar={fechar}
          onConfirmar={async ({ horario, texto }) => {
            const ok = await registrarConteudo({ tipo: 'observacao', dados: { texto } }, 'Observação registrada.', { horarioFato: horario })
            if (ok) fechar()
          }}
        />
      )}

      {acao === 'parada' && proxima && (
        <FolhaParada
          aberta
          ocupado={ocupado}
          erro={erro}
          onCancelar={fechar}
          onConfirmar={async (motivo?: MotivoParada) => {
            const ok = await registrarConteudo(
              { tipo: 'parada_nao_planejada', etapaId: proxima, dados: { fase: 'inicio', ...(motivo ? { motivo } : {}) } },
              `PARAMOS registrado às ${formatarHora(agora)}.`,
            )
            if (ok) {
              fechar()
              oferecerDescida('nao_planejada', proxima)
            }
          }}
        />
      )}

      {acao === 'imprevisto' && (
        <FolhaImprevisto
          aberta
          ocupado={ocupado}
          erro={erro}
          agora={agora}
          emViagem={s.situacao === 'em_viagem'}
          onUsarParamos={() => abrir('parada')}
          onCancelar={fechar}
          onConfirmar={async ({ horario, categoria, observacao }: { horario: Instante; categoria: TipoImprevisto; observacao: string }) => {
            const ok = await registrarConteudo({ tipo: 'imprevisto', dados: { categoria } }, 'Imprevisto registrado.', {
              horarioFato: horario,
              ...(observacao ? { observacao } : {}),
            })
            if (ok) setAcao(podeRecalibrar ? 'oferta' : null)
          }}
        />
      )}

      <Confirmar
        aberto={acao === 'oferta'}
        titulo="Imprevisto registrado"
        rotuloConfirmar="ATUALIZAR PREVISÃO"
        onConfirmar={() => abrir('recalibracao')}
        onCancelar={fechar}
      >
        <p>Quer atualizar a previsão com o horário do Google Maps?</p>
      </Confirmar>

      {acao === 'recalibracao' && proxima && (
        <FolhaRecalibracao
          aberta
          ocupado={ocupado}
          erro={erro}
          agora={agora}
          linkMapa={mapa}
          nomeEtapa={nome(proxima)}
          onCancelar={fechar}
          onConfirmar={async (horario: Instante) => {
            const ok = await registrarConteudo(
              { tipo: 'recalibracao', etapaId: proxima, dados: { horario } },
              `Previsão atualizada para ${formatarHora(horario)}.`,
            )
            if (ok) fechar()
          }}
        />
      )}

      {acao === 'volta' && proxima && (
        <FolhaHorario
          aberta
          ocupado={ocupado}
          erro={erro}
          agora={agora}
          titulo="A que horas voltamos à estrada?"
          rotulo="Horário do VOLTAMOS"
          inicial=""
          dica="A parada não planejada foi registrada e ficou aberta. O VOLTAMOS será gravado antes da chegada."
          onCancelar={fechar}
          onConfirmar={async (retornoEm: Instante) => {
            const ok = await registrar(
              () => repo.registrarChegada(viagem.id, proxima, { retornoEm }),
              `Chegada registrada às ${formatarHora(agora)}.`,
            )
            if (ok) {
              fechar()
              oferecerDescida('etapa', proxima)
            }
          }}
        />
      )}

      <Confirmar
        aberto={acao === 'pular'}
        titulo="Pular etapa?"
        rotuloConfirmar="Pular"
        perigo
        onConfirmar={async () => {
          if (!proxima) return
          const ok = await registrarConteudo({ tipo: 'pular_etapa', etapaId: proxima }, `${nome(proxima)} pulada.`)
          if (ok) fechar()
        }}
        onCancelar={fechar}
      >
        <p>
          {proxima ? nome(proxima) : 'A etapa'} sai do percurso e a previsão é recalculada. Dá para desfazer logo depois.
        </p>
        {erro && acao === 'pular' && <p className="msg-erro">{erro}</p>}
      </Confirmar>
    </>
  )
}
