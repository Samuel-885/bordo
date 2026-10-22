// Alternativas das paradas flexíveis futuras: classe, chegada, margem e impacto no destino de
// cada local, para escolher (ESCOLHER grava a troca de local) ou pular a parada. As regras
// (avaliação, validação da troca e do pulo) vêm do núcleo; os registros passam pelo repositório.

import { useEffect, useState } from 'react'
import { calcularEstado, validarPulo } from '../core/previsao'
import { modoDaRecalibracao } from '../core/recalibracao'
import {
  avaliarAlternativas,
  paradasFlexiveisPendentes,
  textoDoTrechoFaltante,
  type AvaliacaoAlternativa,
  type TrechoFaltante,
} from '../core/viabilidade'
import type { ConteudoEvento } from '../core/eventos'
import type { Consulta, DadosPlano, Evento, Etapa, Instante, Local } from '../core/tipos'
import type { Repositorio, ResultadoRegistro } from '../data/repositorio'
import { mensagemDeErroDoBanco } from '../data/avisoBanco'
import { AvisoDesfazer } from './componentes/AvisoDesfazer'
import { Confirmar } from './componentes/Confirmar'
import { Folha } from './componentes/Folha'
import { FolhaRecalibracao } from './Folhas'
import { Hora } from './componentes/Hora'
import { Topo } from './componentes/Topo'
import {
  linkTelefone,
  rotuloDaClasse,
  textoDaMargem,
  textoDoAvisoDaAlternativa,
  textoDaConsulta,
  textoDoImpacto,
} from './logica/alternativas'
import { formatarDuracao, minutosDeHorasEMinutos } from './logica/duracao'
import { formatarHora } from './logica/horarios'
import { linkGoogleMaps } from './logica/linkMaps'
import { nomeDaEtapa } from './logica/textos'
import { useAgora, useAoMudar } from './useAgora'
import { useDados } from './useDados'

const JANELA_DESFAZER_MS = 8000

interface Props {
  repo: Repositorio
  viagemId: string
  onVoltar: () => void
  /** A demonstração usa para sair do cenário e entrar no modo livre. */
  aoRegistrar?: () => void
}

export function Alternativas({ repo, viagemId, onVoltar, aoRegistrar }: Props) {
  const { dados, erro, recarregar } = useDados(async () => {
    const [plano, eventos, consultas] = await Promise.all([
      repo.carregarPlano(viagemId),
      repo.listarEventos(viagemId),
      repo.listarConsultas(viagemId),
    ])
    return { plano, eventos, consultas }
  }, `alternativas:${repo.espaco}:${viagemId}`)
  useAoMudar(recarregar)
  const agora = useAgora()

  if (erro || (dados && (!dados.plano || !dados.plano.viagem.planoOriginal))) {
    return (
      <>
        <Topo titulo="Alternativas" onVoltar={onVoltar} />
        <main className="conteudo"><p className="msg-erro">{erro ?? 'Viagem não encontrada ou ainda não iniciada.'}</p></main>
      </>
    )
  }
  if (!dados?.plano) return <Topo titulo="Alternativas" onVoltar={onVoltar} />
  return (
    <Conteudo
      repo={repo}
      plano={dados.plano}
      eventos={dados.eventos}
      consultas={dados.consultas}
      agora={agora}
      recarregar={recarregar}
      onVoltar={onVoltar}
      aoRegistrar={aoRegistrar}
    />
  )
}

interface ConteudoProps {
  repo: Repositorio
  plano: DadosPlano
  eventos: Evento[]
  consultas: Consulta[]
  agora: Instante
  recarregar: () => void
  onVoltar: () => void
  aoRegistrar?: () => void
}

interface TrocaPendente {
  etapaId: string
  localId: string
  nome: string
  motivos: string[]
  /** Aplica a consulta ao Google Maps (troca + recalibração) em vez da troca simples. */
  consulta?: boolean
}

function Conteudo({ repo, plano, eventos, consultas, agora, recarregar, onVoltar, aoRegistrar }: ConteudoProps) {
  const { viagem, locais } = plano
  const original = viagem.planoOriginal!
  const estado = calcularEstado(plano, original, eventos, agora)
  const pendentes = viagem.status === 'em_andamento' ? paradasFlexiveisPendentes(plano, estado) : []

  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [desfazer, setDesfazer] = useState<{ ids: string[]; texto: string } | null>(null)
  const [troca, setTroca] = useState<TrocaPendente | null>(null)
  const [pulando, setPulando] = useState<Etapa | null>(null)
  const [informando, setInformando] = useState<TrechoFaltante | null>(null)
  /** Escolha de alternativa sem o trecho em curso: pede a chegada pelo Google Maps. */
  /** CONSULTAR NO MAPS: a folha que pede a chegada e guarda a consulta (não altera a previsão). */
  const [consultando, setConsultando] = useState<{ etapaId: string; localId: string; nome: string } | null>(null)
  const [chegadaMaps, setChegadaMaps] = useState<{ etapaId: string; localId: string; nome: string } | null>(null)
  const [horas, setHoras] = useState('')
  const [minutos, setMinutos] = useState('')

  useEffect(() => {
    if (!desfazer) return
    const t = setTimeout(() => setDesfazer(null), JANELA_DESFAZER_MS)
    return () => clearTimeout(t)
  }, [desfazer])

  const localDe = (id: string): Local | undefined => locais.find((l) => l.id === id)

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

  const registrarConteudo = (c: ConteudoEvento, texto: string) => registrar(() => repo.registrarEvento(viagem.id, c), texto)

  async function desfazerUltimo() {
    if (!desfazer) return
    const { ids } = desfazer
    setDesfazer(null)
    const r = await repo.desfazerRegistro(viagem.id, ids)
    if (!r.ok) setErro(r.motivo)
    recarregar()
  }

  /** Motivos para pedir confirmação: o local chega fechado ou há uma previsão do Google Maps. */
  function motivosDeConfirmacao(etapa: Etapa, a: AvaliacaoAlternativa, nome: string): string[] {
    const consultada = a.consulta?.situacao === 'vigente'
    const motivos: string[] = []
    if (a.classe === 'inviavel') {
      motivos.push(`${nome} está fechado no horário previsto de chegada${a.chegada ? ` (${formatarHora(a.chegada)})` : ''}.`)
    }
    const chegada = estado.etapas.find((e) => e.etapaId === etapa.id)?.chegada
    if (chegada?.origem === 'recalibracao') {
      motivos.push(
        `A previsão do Google Maps${chegada.recalibradoEm ? ` informada às ${formatarHora(chegada.recalibradoEm)}` : ''} ${consultada ? 'é substituída pela consulta' : 'deixa de valer: a previsão volta a ser calculada pelo trecho'}.`,
      )
    }
    return motivos
  }

  async function trocar(t: { etapaId: string; localId: string; nome: string; consulta?: boolean }) {
    const ok = t.consulta
      ? await registrar(() => repo.aplicarConsulta(viagem.id, t.etapaId, t.localId), `Local trocado para ${t.nome}, com a chegada do Google Maps.`)
      : await registrarConteudo(
          { tipo: 'troca_local', etapaId: t.etapaId, dados: { localId: t.localId } },
          `Local trocado para ${t.nome}.`,
        )
    if (ok) setTroca(null)
  }

  async function guardarConsulta(horario: Instante) {
    if (!consultando) return
    setOcupado(true)
    setErro(null)
    try {
      const r = await repo.salvarConsulta(viagem.id, consultando.etapaId, consultando.localId, horario)
      if (!r.ok) return setErro(r.motivo)
      setConsultando(null)
      recarregar()
    } catch (x) {
      setErro(mensagemDeErroDoBanco(x, 'Não foi possível guardar a consulta.'))
    } finally {
      setOcupado(false)
    }
  }

  async function descartarConsulta(etapaId: string, localId: string) {
    await repo.descartarConsulta(viagem.id, etapaId, localId)
    recarregar()
  }

  function escolher(etapa: Etapa, a: AvaliacaoAlternativa) {
    setErro(null)
    const nome = localDe(a.localId)?.nome ?? 'O local'
    const motivos = motivosDeConfirmacao(etapa, a, nome)
    const consulta = a.consulta?.situacao === 'vigente'
    const t = { etapaId: etapa.id, localId: a.localId, nome, ...(consulta ? { consulta } : {}) }
    if (a.exigeChegadaPeloMaps) return setChegadaMaps(t)
    if (motivos.length > 0) setTroca({ ...t, motivos })
    else void trocar(t)
  }

  async function trocarComChegada(horario: Instante) {
    if (!chegadaMaps) return
    const { etapaId, localId, nome } = chegadaMaps
    const ok = await registrar(
      () => repo.registrarTrocaComChegada(viagem.id, etapaId, localId, horario),
      `Local trocado para ${nome}, chegada às ${formatarHora(horario)}.`,
    )
    if (ok) setChegadaMaps(null)
  }

  function abrirInformar(t: TrechoFaltante) {
    setErro(null)
    setHoras('')
    setMinutos('')
    setInformando(t)
  }

  async function salvarTempo() {
    if (!informando) return
    const total = minutosDeHorasEMinutos(horas, minutos)
    if (total === null) return setErro('Digite uma duração válida (minutos até 59).')
    setOcupado(true)
    setErro(null)
    try {
      const r = await repo.salvarTrechoManualEmViagem(viagem.id, informando, total)
      if (!r.ok) return setErro(r.motivo)
      setInformando(null)
      recarregar()
    } catch (x) {
      setErro(mensagemDeErroDoBanco(x, 'Não foi possível salvar o tempo.'))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <>
      <Topo titulo="Alternativas" onVoltar={onVoltar} rotuloVoltar="Voltar à viagem" />
      <main className="conteudo viagem">
        {pendentes.length === 0 && <p className="dica">Não há parada flexível pela frente.</p>}

        {pendentes.map((etapa) => {
          const lista = avaliarAlternativas(plano, original, eventos, agora, etapa.id, consultas)
          const podeConsultar =
            etapa.id === estado.proximaEtapaId && modoDaRecalibracao(plano, original, eventos, etapa.id, agora) !== null
          const nomeEtapa = nomeDaEtapa(etapa, locais)
          return (
            <section className="cartao" key={etapa.id} aria-label={nomeEtapa}>
              <h2>{nomeEtapa}</h2>
              <p className="dica">
                Permanência de {formatarDuracao(etapa.permanenciaMin)}
                {etapa.janelaInicio && etapa.janelaFim && (
                  <> · janela {formatarHora(etapa.janelaInicio)}–{formatarHora(etapa.janelaFim)}</>
                )}
              </p>

              <ul className="lista-alternativas">
                {lista.map((a) => {
                  const local = localDe(a.localId)
                  const mapa = linkGoogleMaps(local)
                  const telefone = linkTelefone(local?.telefone)
                  const bloqueada = !a.escolhida && !a.exigeChegadaPeloMaps && (a.classe === 'sem_tempo' || a.trechosFaltantes.length > 0)
                  return (
                    <li key={a.localId} className={`alternativa ${a.escolhida ? 'escolhida' : ''}`}>
                      <div className="alternativa-topo">
                        <strong>{local?.nome ?? 'Local'}</strong>
                        {a.escolhida && <span className="etiqueta">ESCOLHIDA</span>}
                      </div>
                      <p className={`classe classe-${a.classe}`}>{rotuloDaClasse(a.classe)}</p>

                      <dl className="dados-alternativa">
                        {a.chegada && (
                          <>
                            <dt>Chegada estimada</dt>
                            <dd><Hora instante={a.chegada} agora={agora} /></dd>
                          </>
                        )}
                        {a.fimParada && (
                          <>
                            <dt>Fim da parada</dt>
                            <dd><Hora instante={a.fimParada} agora={agora} /></dd>
                          </>
                        )}
                        <dt>Fecha às</dt>
                        <dd>{local?.fecha ? <span className="mono">{local.fecha}</span> : 'não cadastrado'}</dd>
                        {a.margemMin !== null && (
                          <>
                            <dt>Margem</dt>
                            <dd>{textoDaMargem(a.margemMin)}</dd>
                          </>
                        )}
                        {(!a.escolhida || a.consulta?.situacao === 'vigente') && (
                          <>
                            <dt>Chegada ao destino</dt>
                            <dd>{a.impactoDestinoMin === null ? 'sem tempo definido' : textoDoImpacto(a.impactoDestinoMin)}</dd>
                          </>
                        )}
                      </dl>

                      {a.consulta && (
                        <p className={`consulta-maps ${a.consulta.situacao}`}>{textoDaConsulta(a.consulta)}</p>
                      )}

                      {a.avisos.length > 0 && (
                        <p className="avisos-alternativa">
                          {a.avisos.map((av) => (
                            <span key={av} className={`aviso-chip aviso-${av}`}>{textoDoAvisoDaAlternativa(av)}</span>
                          ))}
                        </p>
                      )}

                      {a.exigeChegadaPeloMaps && (
                        <p className="dica">Informe a chegada pelo Google Maps para escolher.</p>
                      )}
                      {!a.escolhida && !a.exigeChegadaPeloMaps && a.trechosFaltantes.map((t) => (
                        <div className="falta-trecho" key={`${t.localOrigemId}>${t.localDestinoId}`}>
                          <span>Falta o tempo de {textoDoTrechoFaltante(plano, t)}.</span>
                          {t.podeInformar && (
                            <button type="button" className="botao pequeno" onClick={() => abrirInformar(t)}>
                              Informar tempo
                            </button>
                          )}
                        </div>
                      ))}
                      {bloqueada && a.trechosFaltantes.length === 0 && !a.exigeChegadaPeloMaps && (
                        <p className="dica">Sem tempo definido para chegar a este local: não dá para escolhê-lo.</p>
                      )}

                      <div className="acoes-alternativa">
                        {!a.escolhida && (
                          <button type="button" className="botao principal" disabled={ocupado || bloqueada} onClick={() => escolher(etapa, a)}>
                            ESCOLHER
                          </button>
                        )}
                        {a.escolhida && a.consulta?.situacao === 'vigente' && (
                          <button
                            type="button"
                            className="botao principal"
                            disabled={ocupado}
                            onClick={() => void registrar(() => repo.aplicarConsulta(viagem.id, etapa.id, a.localId), 'Previsão atualizada pela consulta ao Google Maps.')}
                          >
                            ATUALIZAR PREVISÃO
                          </button>
                        )}
                        {podeConsultar && (
                          <button
                            type="button"
                            className="botao"
                            disabled={ocupado}
                            onClick={() => { setErro(null); setConsultando({ etapaId: etapa.id, localId: a.localId, nome: local?.nome ?? 'o local' }) }}
                          >
                            CONSULTAR NO MAPS
                          </button>
                        )}
                        {a.consulta && (
                          <button type="button" className="botao" onClick={() => void descartarConsulta(etapa.id, a.localId)}>
                            DESCARTAR CONSULTA
                          </button>
                        )}
                        {mapa && (
                          <a className="botao link-botao" href={mapa} target="_blank" rel="noopener noreferrer">
                            GOOGLE MAPS
                          </a>
                        )}
                        {telefone && (
                          <a className="botao link-botao" href={telefone}>
                            LIGAR
                          </a>
                        )}
                      </div>
                      {/* Fase 7: aqui entra a mensagem para o restaurante ("Grupo de N pessoas, chegada prevista às HH:MM"). */}
                    </li>
                  )
                })}
              </ul>

              {validarPulo(plano, estado, etapa.id).ok && (
                <button type="button" className="botao largo" disabled={ocupado} onClick={() => { setErro(null); setPulando(etapa) }}>
                  PULAR ESTA PARADA
                </button>
              )}
            </section>
          )
        })}

        {erro && !troca && !pulando && !informando && !chegadaMaps && !consultando && <p className="msg-erro" role="alert">{erro}</p>}
      </main>

      {desfazer && <AvisoDesfazer texto={desfazer.texto} onDesfazer={() => void desfazerUltimo()} />}

      <Confirmar
        aberto={troca !== null}
        titulo={`Trocar para ${troca?.nome ?? ''}?`}
        rotuloConfirmar="Trocar"
        perigo
        onConfirmar={() => troca && void trocar(troca)}
        onCancelar={() => { setErro(null); setTroca(null) }}
      >
        {troca?.motivos.map((m) => <p key={m}>{m}</p>)}
        <p className="dica">Dá para desfazer logo depois.</p>
        {erro && troca && <p className="msg-erro">{erro}</p>}
      </Confirmar>

      <Confirmar
        aberto={pulando !== null}
        titulo="Pular esta parada?"
        rotuloConfirmar="Pular"
        perigo
        onConfirmar={async () => {
          if (!pulando) return
          const ok = await registrarConteudo({ tipo: 'pular_etapa', etapaId: pulando.id }, `${nomeDaEtapa(pulando, locais)} pulada.`)
          if (ok) setPulando(null)
        }}
        onCancelar={() => { setErro(null); setPulando(null) }}
      >
        <p>{pulando ? nomeDaEtapa(pulando, locais) : 'A parada'} sai do percurso e a previsão é recalculada. Dá para desfazer logo depois.</p>
        {erro && pulando && <p className="msg-erro">{erro}</p>}
      </Confirmar>

      {consultando && (
        <FolhaRecalibracao
          aberta
          ocupado={ocupado}
          erro={erro}
          agora={agora}
          linkMapa={linkGoogleMaps(localDe(consultando.localId))}
          nomeEtapa={consultando.nome}
          titulo={`Chegada no ${consultando.nome} pelo Google Maps`}
          rotuloConfirmar="Calcular"
          dica={`Abra o Google Maps (a rota sai da sua posição), veja o horário de chegada em ${consultando.nome} e digite aqui. É só uma consulta: a previsão não muda até você escolher.`}
          onCancelar={() => { setErro(null); setConsultando(null) }}
          onConfirmar={(h) => void guardarConsulta(h)}
        />
      )}

      {chegadaMaps && (
        <FolhaRecalibracao
          aberta
          ocupado={ocupado}
          erro={erro}
          agora={agora}
          linkMapa={linkGoogleMaps(localDe(chegadaMaps.localId))}
          nomeEtapa={chegadaMaps.nome}
          titulo={`Chegada no ${chegadaMaps.nome} pelo Google Maps`}
          rotuloConfirmar="Trocar"
          dica={`Abra o Google Maps, veja o horário de chegada em ${chegadaMaps.nome} e digite aqui. A troca e a previsão são gravadas juntas.`}
          onCancelar={() => { setErro(null); setChegadaMaps(null) }}
          onConfirmar={(h) => void trocarComChegada(h)}
        />
      )}

      <Folha
        aberta={informando !== null}
        titulo="Informar tempo do trecho"
        rotuloConfirmar="Salvar"
        ocupado={ocupado}
        erro={informando ? erro : null}
        onConfirmar={() => void salvarTempo()}
        onCancelar={() => { setErro(null); setInformando(null) }}
      >
        {informando && <p>{textoDoTrechoFaltante(plano, informando)}</p>}
        <div className="trecho-form">
          <input inputMode="numeric" aria-label="Horas" placeholder="h" value={horas} onChange={(e) => setHoras(e.target.value)} />
          <span>h</span>
          <input inputMode="numeric" aria-label="Minutos" placeholder="min" value={minutos} onChange={(e) => setMinutos(e.target.value)} />
          <span>min</span>
        </div>
        <p className="dica">Fica guardado como tempo manual, sem fator ônibus. O plano original não muda.</p>
      </Folha>
    </>
  )
}
