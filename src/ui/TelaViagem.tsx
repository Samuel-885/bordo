// Tela principal da viagem. Responde em segundos: onde estamos, próxima etapa, quanto
// falta, previsão e atraso. Nenhuma regra aqui: a situação, as travas e o cálculo vêm do
// núcleo; os registros passam pelo repositório.

import { useEffect, useState } from 'react'
import { classificarAtraso } from '../core/atraso'
import { pendenciasDeRegistro, validarPulo } from '../core/previsao'
import { validarRecalibracao } from '../core/recalibracao'
import { situacaoDaViagem } from '../core/registro'
import { ordenarEtapas } from '../core/trechos'
import type { ConteudoEvento } from '../core/eventos'
import type { Evento, Instante, Local, MotivoParada, TipoImprevisto } from '../core/tipos'
import type { Repositorio, ResultadoRegistro } from '../data/repositorio'
import { AvisoDesfazer } from './componentes/AvisoDesfazer'
import { CampoHora } from './componentes/CampoHora'
import { Confirmar } from './componentes/Confirmar'
import { Hora } from './componentes/Hora'
import { Topo } from './componentes/Topo'
import { FolhaHorario, FolhaImprevisto, FolhaParada, FolhaRecalibracao } from './Folhas'
import { resolverHorarioPassado } from './logica/horarioDigitado'
import { formatarHora } from './logica/horarios'
import { linkGoogleMaps } from './logica/linkMaps'
import { nomeDaEtapa } from './logica/textos'
import {
  nomeDaEtapaEmUso,
  textoDaOrigemDaPrevisao,
  textoDaSituacao,
  textoDoAtraso,
  textoDoCronometro,
  textoDoTempoRestante,
  formatarDuracaoCurta,
} from './logica/textosViagem'
import { useAgora, useAoMudar } from './useAgora'
import { useDados } from './useDados'

const JANELA_DESFAZER_MS = 8000

interface Props {
  repo: Repositorio
  viagemId: string
  onVoltar: () => void
  onTimeline: () => void
  /** A demonstração usa para sair do cenário e entrar no modo livre. */
  aoRegistrar?: () => void
}

type Acao = 'parada' | 'imprevisto' | 'recalibracao' | 'volta' | 'pular' | 'oferta' | null

export function TelaViagem({ repo, viagemId, onVoltar, onTimeline, aoRegistrar }: Props) {
  const { dados, erro, recarregar } = useDados(async () => {
    const [plano, eventos] = await Promise.all([repo.carregarPlano(viagemId), repo.listarEventos(viagemId)])
    return { plano, eventos }
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
      agora={agora}
      recarregar={recarregar}
      onVoltar={onVoltar}
      onTimeline={onTimeline}
      aoRegistrar={aoRegistrar}
    />
  )
}

interface ConteudoProps {
  repo: Repositorio
  plano: NonNullable<Awaited<ReturnType<Repositorio['carregarPlano']>>>
  eventos: Evento[]
  agora: Instante
  recarregar: () => void
  onVoltar: () => void
  onTimeline: () => void
  aoRegistrar?: () => void
}

function Conteudo({ repo, plano, eventos, agora, recarregar, onVoltar, onTimeline, aoRegistrar }: ConteudoProps) {
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
      setErro(x instanceof Error ? x.message : 'Não foi possível registrar.')
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

  /** Ponto de entrada da conferência (fase 5): hoje grava a saída direto. */
  const aoSair = (etapaId: string) =>
    registrarConteudo({ tipo: 'saida', etapaId }, `Saída registrada às ${formatarHora(agora)}.`)
  const aoChegar = (etapaId: string) =>
    registrar(() => repo.registrarChegada(viagem.id, etapaId), `Chegada registrada às ${formatarHora(agora)}.`)

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
          </section>
        )}

        {s.paradaNaoPlanejada && (
          <section className="cartao atencao" aria-label="Parada não planejada">
            <h2>Parada não planejada</h2>
            <p className="cronometro">parados há {formatarDuracaoCurta(s.paradaNaoPlanejada.decorridoMin)}</p>
            <p className="dica">Desde as {formatarHora(s.paradaNaoPlanejada.inicio)}.</p>
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

        {/* Fase 5: a bordo e conferência. Fase 6: alternativas e viabilidade. Fase 7: GERAR ATUALIZAÇÃO. */}

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
                    onClick={() =>
                      s.paradaNaoPlanejada &&
                      void registrarConteudo(
                        { tipo: 'parada_nao_planejada', etapaId: s.paradaNaoPlanejada.etapaId, dados: { fase: 'fim' } },
                        `VOLTAMOS registrado às ${formatarHora(agora)}.`,
                      )
                    }
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
            if (ok) fechar()
          }}
        />
      )}

      {acao === 'imprevisto' && (
        <FolhaImprevisto
          aberta
          ocupado={ocupado}
          erro={erro}
          agora={agora}
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
            if (ok) fechar()
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
