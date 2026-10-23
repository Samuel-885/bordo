// Tela de planejamento da viagem: dados da viagem, etapas em ordem, trechos entre
// elas e o botão "Iniciar viagem". Nenhuma regra aqui: tudo vem do núcleo.

import { Fragment, useState } from 'react'
import { avisosDoPlano, horariosForaDeOrdem } from '../core/avisos'
import { calcularPlanoOriginal, estadosDoPlano } from '../core/previsao'
import { agora } from '../core/relogio'
import type { BloqueioInicio } from '../core/previsao'
import type { ParDeAlternativas, ParDeTrecho } from '../core/trechos'
import type { DadosPlano, DuracaoTrecho, Etapa, EstadoEtapa, Passageiro, TipoViagem, Trecho } from '../core/tipos'
import type { Repositorio } from '../data/repositorio'
import { AcoesDeBackup } from './componentes/AcoesDeBackup'
import { BarraDeAbas, type Aba } from './componentes/BarraDeAbas'
import { BarraDeAcao } from './componentes/BarraDeAcao'
import { Cabecalho } from './componentes/Cabecalho'
import { Confirmar } from './componentes/Confirmar'
import { Hora } from './componentes/Hora'
import { GrupoDadosEAparelho, GrupoDeMenu, ItemDeMenu } from './componentes/MenuMais'
import { Topo } from './componentes/Topo'
import { Locais } from './Locais'
import { Passageiros } from './Passageiros'
import { useAlturaDoRodape } from './viagem/useAlturaDoRodape'
import { formatarDuracao, horasEMinutosDe, minutosDeHorasEMinutos } from './logica/duracao'
import { dataParaInstante, diasDepois, formatarData, formatarHora } from './logica/horarios'
import { etiquetaDaEtapa } from './logica/rotulos'
import { resumoDaEtapa, textoDoAviso, textoManuaisApagados, textoDoBloqueio, textoForaDeOrdem } from './logica/textos'
import { podeMover } from '../core/ordem'
import { paresDeTrechoDasAlternativas } from '../core/trechos'
import { fatorSugeridoPeloRoteiro, locaisSemCoordenadas, paresParaCalcular, trechoDoPar, validarFatorOnibus, type FatorSugerido } from '../core/rotas'
import { aplicarFatorOnibus } from '../core/trechos'
import { CalculoDeRotas } from './CalculoDeRotas'
import { descreverTrecho, formatarFator, lerFator } from './logica/trechoDescricao'
import { textoTotalDePassageiros } from './logica/passageiros'
import { useAgora } from './useAgora'
import { useDados } from './useDados'
import { mensagemDeErroDoBanco } from '../data/avisoBanco'

interface Props {
  repo: Repositorio
  viagemId: string
  onVoltar: () => void
  onEditarEtapa: (etapaId: string | null) => void
  onViagemExcluida: () => void
  /** Abre a tela principal da viagem (depois de iniciada). */
  onAbrirViagem: () => void
  aba: Aba
  onAba: (aba: Aba) => void
  onModelos: () => void
  onBackup: () => void
  onEditarLocal: (localId: string | null) => void
  onAbrirDemo: () => void
  onSairDaDemo: () => void
}

export function Planejamento({ repo, viagemId, onVoltar, onEditarEtapa, onViagemExcluida, onAbrirViagem, aba, onAba, onModelos, onBackup, onEditarLocal, onAbrirDemo, onSairDaDemo }: Props) {
  const { dados, erro, recarregar } = useDados(
    async () => {
      const [plano, passageiros] = await Promise.all([repo.carregarPlano(viagemId), repo.listarPassageiros(viagemId)])
      return { plano, passageiros }
    },
    `${repo.espaco}:${viagemId}`,
  )
  const plano = dados?.plano
  const [falha, setFalha] = useState<string | null>(null)

  if (erro) {
    return (
      <>
        <Topo titulo="Planejamento" onVoltar={onVoltar} />
        <main className="conteudo">
          <p className="msg-erro">{erro}</p>
        </main>
      </>
    )
  }
  if (!plano) return <Topo titulo="Planejamento" onVoltar={onVoltar} />

  async function agir(acao: () => Promise<unknown>) {
    try {
      setFalha(null)
      await acao()
      recarregar()
    } catch (x) {
      setFalha(mensagemDeErroDoBanco(x, 'Não foi possível salvar.'))
    }
  }

  return (
    <Conteudo
      plano={plano}
      passageiros={dados!.passageiros}
      repo={repo}
      falha={falha}
      agir={agir}
      recarregarPlano={recarregar}
      onVoltar={onVoltar}
      onEditarEtapa={onEditarEtapa}
      onViagemExcluida={onViagemExcluida}
      onAbrirViagem={onAbrirViagem}
      aba={aba}
      onAba={onAba}
      onModelos={onModelos}
      onBackup={onBackup}
      onEditarLocal={onEditarLocal}
      onAbrirDemo={onAbrirDemo}
      onSairDaDemo={onSairDaDemo}
    />
  )
}

interface ConteudoProps {
  plano: DadosPlano
  passageiros: Passageiro[]
  repo: Repositorio
  falha: string | null
  agir: (acao: () => Promise<unknown>) => Promise<void>
  recarregarPlano: () => void
  onVoltar: () => void
  onEditarEtapa: (etapaId: string | null) => void
  onViagemExcluida: () => void
  onAbrirViagem: () => void
  aba: Aba
  onAba: (aba: Aba) => void
  onModelos: () => void
  onBackup: () => void
  onEditarLocal: (localId: string | null) => void
  onAbrirDemo: () => void
  onSairDaDemo: () => void
}

function Conteudo({ plano, passageiros, repo, falha, agir, recarregarPlano, onVoltar, onEditarEtapa, onViagemExcluida, onAbrirViagem, aba, onAba, onModelos, onBackup, onEditarLocal, onAbrirDemo, onSairDaDemo }: ConteudoProps) {
  const { viagem, etapas, locais } = plano
  const planejando = viagem.status === 'planejando'
  const estados = estadosDoPlano(plano)
  const avisos = avisosDoPlano(plano, estados, passageiros)
  const paresDasAlternativas = paresDeTrechoDasAlternativas(plano)
  const semCoordenadas = paresParaCalcular(plano).semCoordenadas
  const rotas: ContextoDeRotas = {
    fator: viagem.fatorOnibus,
    plano,
    faltaCoordenadas: (par) => {
      const key = (p: ParDeTrecho) => `${p.etapaOrigemId}|${p.localOrigemId}|${p.etapaDestinoId}|${p.localDestinoId}`
      if (!semCoordenadas.some((p) => key(p) === key(par))) return []
      return locaisSemCoordenadas(plano, [par]).map((id) => locais.find((l) => l.id === id)?.nome ?? 'local')
    },
    onUsarRota: (par) => agir(() => repo.usarRotaNoLugarDoManual(viagem.id, par)),
    onManterManual: (par) => agir(() => repo.manterTempoManual(viagem.id, par)),
  }
  const foraDeOrdem = horariosForaDeOrdem(plano)
  const calculo = calcularPlanoOriginal(plano, agora())
  const bloqueios: BloqueioInicio[] = calculo.ok ? [] : calculo.bloqueios
  const agoraDoRelogio = useAgora()
  const rodape = useAlturaDoRodape()
  const bloqueado = !calculo.ok || foraDeOrdem.length > 0 || !viagem.nome.trim()

  const [confirmarInicio, setConfirmarInicio] = useState(false)
  /** Um backup foi entregue enquanto a folha "Fazer backup antes de iniciar?" estava aberta. */
  const [backupFeito, setBackupFeito] = useState(false)
  const [confirmarExclusao, setConfirmarExclusao] = useState(false)
  const [bloqueiosDoInicio, setBloqueiosDoInicio] = useState<BloqueioInicio[]>([])
  const [moverPendente, setMoverPendente] = useState<{ etapaId: string; sentido: 'subir' | 'descer'; apagados: number } | null>(null)

  /** Move direto; se apagaria tempos digitados à mão, pede confirmação antes. */
  async function pedirMover(etapaId: string, sentido: 'subir' | 'descer') {
    try {
      const apagados = await repo.contarManuaisApagadosAoMover(etapaId, sentido)
      if (apagados > 0) setMoverPendente({ etapaId, sentido, apagados })
      else await agir(() => repo.moverEtapa(etapaId, sentido))
    } catch (x) {
      await agir(() => Promise.reject(x))
    }
  }

  const nomeLocal = (id: string | null) => locais.find((l) => l.id === id)?.nome

  async function iniciar() {
    setConfirmarInicio(false)
    setBackupFeito(false)
    await agir(async () => {
      const r = await repo.iniciarViagem(viagem.id)
      setBloqueiosDoInicio(r.ok === false && r.motivo === 'bloqueios' ? r.bloqueios : [])
      if (r.ok) onAbrirViagem()
    })
  }

  const destinoPrevisto = estados.at(-1)?.chegada ?? null
  const principal = planejando
    ? { rotulo: 'INICIAR VIAGEM', desabilitada: bloqueado, dica: bloqueado ? 'Resolva os itens da aba Viagem' : undefined, onClick: () => setConfirmarInicio(true) }
    : null

  return (
    <>
      <Cabecalho subtitulo={`${viagem.nome || 'Viagem'} · ${planejando ? 'Planejando' : 'Iniciada'}`} />

      {aba === 'viagem' && (
        <main className="conteudo viagem">
          {!planejando && <Iniciada plano={plano} onAbrir={onAbrirViagem} />}

          <DadosDaViagem key={viagem.id} plano={plano} editavel={planejando} salvar={(v) => agir(() => repo.salvarViagem(v))} salvarFator={(f) => agir(() => repo.salvarFatorOnibus(viagem.id, f))} />

          <button type="button" className="cartao pequeno" onClick={() => onAba('pessoas')}>
            <h2>Passageiros</h2>
            <span className="valor">{passageiros.length === 0 ? 'Nenhum cadastrado' : textoTotalDePassageiros(passageiros.length)}</span>
          </button>

          {planejando && (
            <>
              {avisos.length > 0 && (
                <div className="aviso" role="note">
                  <h3>Avisos (não impedem de iniciar)</h3>
                  <ul>
                    {avisos.map((a, i) => (
                      <li key={i}>{textoDoAviso(a, etapas, locais)}</li>
                    ))}
                  </ul>
                </div>
              )}

              {(bloqueios.length > 0 || foraDeOrdem.length > 0 || !viagem.nome.trim() || bloqueiosDoInicio.length > 0) && (
                <div className="aviso bloqueio" role="alert">
                  <h3>Para iniciar, falta resolver:</h3>
                  <ul>
                    {!viagem.nome.trim() && <li>Dê um nome à viagem.</li>}
                    {bloqueios.map((b, i) => (
                      <li key={i}>{textoDoBloqueio(b, etapas, locais)}</li>
                    ))}
                    {foraDeOrdem.map((f) => (
                      <li key={f.etapaId}>{textoForaDeOrdem(f, etapas, locais)}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="congelar">Ao iniciar, este planejamento vira a expectativa original e fica congelado.</p>
            </>
          )}
        </main>
      )}

      {aba === 'roteiro' && (
        <main className="conteudo viagem">
          {planejando && <CalculoDeRotas plano={plano} repo={repo} onAtualizar={recarregarPlano} onEditarLocal={onEditarLocal} />}
          <section aria-label="Etapas" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {etapas.map((etapa, i) => {
            const estado = estados.find((e) => e.etapaId === etapa.id)
            const proxima = etapas[i + 1]
            const estadoProximo = estados[i + 1]
            const par =
              proxima && estado?.localId != null && estadoProximo?.localId != null
                ? {
                    etapaOrigemId: etapa.id,
                    localOrigemId: estado.localId,
                    etapaDestinoId: proxima.id,
                    localDestinoId: estadoProximo.localId,
                  }
                : null
            const guardado = par ? trechoDoPar(plano, par) : undefined
            const manual = guardado?.fonte === 'manual' ? guardado.duracaoMin : null
            return (
              <Fragment key={etapa.id}>
                <LinhaEtapa
                  etapa={etapa}
                  estado={estado}
                  dataSaida={viagem.dataSaida}
                  local={nomeLocal(etapa.localId) ?? (etapa.tipo === 'flexivel' ? 'Sem local escolhido' : 'Sem local')}
                  editavel={planejando}
                  podeSubir={podeMover(etapas, etapa.id, 'subir')}
                  podeDescer={podeMover(etapas, etapa.id, 'descer')}
                  onAbrir={() => onEditarEtapa(etapa.id)}
                  onMover={(sentido) => void pedirMover(etapa.id, sentido)}
                />
                {estadoProximo && (
                  <LinhaTrecho
                    key={`${etapa.id}-${manual}`}
                    trecho={estadoProximo.trechoChegada}
                    editavel={planejando}
                    pode={par !== null}
                    duracaoManual={manual}
                    guardado={guardado}
                    rotas={rotas}
                    par={par}
                    onSalvar={(min) => agir(() => repo.salvarTrechoManual(viagem.id, par!, min))}
                    onRemover={() => agir(() => repo.removerTrecho(viagem.id, par!))}
                  />
                )}
                {estadoProximo && (
                  <TemposDasAlternativas
                    pares={paresDasAlternativas.filter((p) => p.par.etapaOrigemId === etapa.id)}
                    plano={plano}
                    editavel={planejando}
                    rotas={rotas}
                    onSalvar={(par, min) => agir(() => repo.salvarTrechoManual(viagem.id, par, min))}
                    onRemover={(par) => agir(() => repo.removerTrecho(viagem.id, par))}
                  />
                )}
              </Fragment>
            )
          })}
          </section>

          {planejando && (
            <button type="button" className="botao largo" onClick={() => onEditarEtapa(null)}>
              Adicionar etapa
            </button>
          )}
        </main>
      )}

      {aba === 'pessoas' && (
        <main className="conteudo viagem">
          <Passageiros repo={repo} viagemId={viagem.id} incorporada />
        </main>
      )}

      {aba === 'locais' && (
        <main className="conteudo viagem">
          <Locais repo={repo} onEditar={onEditarLocal} incorporada />
        </main>
      )}

      {aba === 'mais' && (
        <main className="conteudo viagem">
          <GrupoDeMenu titulo="Comunicação">
            <ItemDeMenu titulo="Modelos de mensagem" detalhe="texto da atualização e do restaurante" onClick={onModelos} />
          </GrupoDeMenu>
          <GrupoDadosEAparelho
            demo={repo.espaco === 'demo'}
            onBackup={onBackup}
            onTrocarViagem={onVoltar}
            onAbrirDemo={onAbrirDemo}
            onSairDaDemo={onSairDaDemo}
            extra={planejando && <ItemDeMenu titulo="Excluir viagem" detalhe="apaga a viagem, as etapas e os tempos" perigo onClick={() => setConfirmarExclusao(true)} />}
          />
        </main>
      )}

      <div className="rodape-fixo" ref={rodape}>
        {principal && aba === 'viagem' && <BarraDeAcao principal={principal} rapidas={[]} ocupado={false} erro={falha} />}
        {principal && aba !== 'viagem' && (
          <BarraDeAcao
            principal={principal}
            rapidas={[]}
            ocupado={false}
            erro={falha}
            compacta={{
              previsao: (
                <>
                  <span className="compacta-rotulo">Destino previsto</span>
                  <span className="compacta-valor">
                    {destinoPrevisto ? <Hora instante={destinoPrevisto.instante} agora={agoraDoRelogio} /> : <span className="sem-tempo-compacto">sem tempo</span>}
                  </span>
                </>
              ),
            }}
          />
        )}
        <BarraDeAbas atual={aba} onMudar={onAba} />
      </div>

      <Confirmar
        aberto={moverPendente !== null}
        titulo="Mover a etapa?"
        perigo
        rotuloConfirmar="Mover e apagar"
        onCancelar={() => setMoverPendente(null)}
        onConfirmar={() => {
          const m = moverPendente
          setMoverPendente(null)
          if (m) void agir(() => repo.moverEtapa(m.etapaId, m.sentido))
        }}
      >
        <p>
          Mudar a ordem apaga {moverPendente ? textoManuaisApagados(moverPendente.apagados) : ''}, porque os trechos
          mudam de vizinhas. Você terá de digitar de novo.
        </p>
      </Confirmar>

      <Confirmar
        aberto={confirmarInicio}
        titulo="Fazer backup antes de iniciar?"
        rotuloConfirmar={backupFeito ? 'Iniciar viagem' : 'INICIAR SEM BACKUP'}
        onCancelar={() => setConfirmarInicio(false)}
        onConfirmar={iniciar}
      >
        <p>O planejamento fica congelado como a expectativa original e não poderá mais ser editado.</p>
        {repo.espaco === 'real' && (
          <>
            <p className="dica">Faça o backup agora, se quiser: iniciar sem ele também é possível.</p>
            <AcoesDeBackup repo={repo} aoEntregar={() => setBackupFeito(true)} />
          </>
        )}
      </Confirmar>

      <Confirmar
        aberto={confirmarExclusao}
        titulo="Excluir a viagem?"
        perigo
        rotuloConfirmar="Excluir viagem"
        onCancelar={() => setConfirmarExclusao(false)}
        onConfirmar={() => {
          setConfirmarExclusao(false)
          void agir(async () => {
            await repo.excluirViagem(viagem.id)
            onViagemExcluida()
          })
        }}
      >
        <p>
          A viagem “{viagem.nome || 'sem nome'}” será apagada com todas as etapas e tempos. Os locais do catálogo ficam.
        </p>
      </Confirmar>
    </>
  )
}

function Iniciada({ plano, onAbrir }: { plano: DadosPlano; onAbrir: () => void }) {
  const inicio = plano.viagem.planoOriginal?.congeladoEm
  return (
    <div className="iniciada" role="status">
      <strong>Viagem iniciada{inicio ? ` às ${formatarHora(inicio)}` : ''}.</strong>
      <p className="dica" style={{ margin: '4px 0 8px' }}>
        O planejamento está congelado.
      </p>
      <button type="button" className="botao principal" onClick={onAbrir}>
        Abrir a viagem
      </button>
    </div>
  )
}

function DadosDaViagem({
  plano,
  editavel,
  salvar,
  salvarFator,
}: {
  plano: DadosPlano
  editavel: boolean
  salvar: (v: DadosPlano['viagem']) => Promise<void>
  salvarFator: (fator: number) => Promise<void>
}) {
  const { viagem } = plano
  const [nome, setNome] = useState(viagem.nome)
  const [identificacao, setIdentificacao] = useState(viagem.identificacao ?? '')
  const [equipe, setEquipe] = useState(String(viagem.equipe ?? 0))
  const equipeNumero = /^\d{1,2}$/.test(equipe.trim()) ? Number(equipe) : null
  return (
    <section className="cartao" aria-label="Dados da viagem">
      <div className="campo">
        <label htmlFor="v-nome">Nome da viagem</label>
        <input
          id="v-nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onBlur={() => nome !== viagem.nome && void salvar({ ...viagem, nome })}
          autoComplete="off"
        />
      </div>
      <div className="campo">
        <label htmlFor="v-identificacao">Identificação (aparece nas mensagens)</label>
        <input
          id="v-identificacao"
          value={identificacao}
          placeholder="Por exemplo: Unidade X — Ipatinga"
          onChange={(e) => setIdentificacao(e.target.value)}
          onBlur={() => identificacao.trim() !== (viagem.identificacao ?? '') && void salvar({ ...viagem, identificacao: identificacao.trim() })}
          autoComplete="off"
        />
      </div>
      <div className="campo">
        <label htmlFor="v-equipe">Equipe (motoristas e responsáveis)</label>
        <input
          id="v-equipe"
          inputMode="numeric"
          value={equipe}
          disabled={viagem.status === 'concluida'}
          onChange={(e) => setEquipe(e.target.value)}
          onBlur={() => equipeNumero !== null && equipeNumero !== (viagem.equipe ?? 0) && void salvar({ ...viagem, equipe: equipeNumero })}
        />
        <p className="dica">Entra no tamanho do grupo da mensagem para o restaurante.</p>
      </div>
      <CampoFatorOnibus plano={plano} editavel={editavel} salvar={salvarFator} />
      <div className="linha-campos">
        <div className="campo">
          <label htmlFor="v-tipo">Tipo</label>
          <select
            id="v-tipo"
            value={viagem.tipo}
            disabled={!editavel}
            onChange={(e) => void salvar({ ...viagem, tipo: e.target.value as TipoViagem })}
          >
            <option value="ida">Ida</option>
            <option value="volta">Volta</option>
          </select>
        </div>
        <div className="campo">
          <label htmlFor="v-data">Data de saída</label>
          <input
            id="v-data"
            type="date"
            value={formatarData(viagem.dataSaida)}
            disabled={!editavel}
            onChange={(e) => e.target.value && void salvar({ ...viagem, dataSaida: dataParaInstante(e.target.value) })}
          />
        </div>
      </div>
    </section>
  )
}

interface LinhaEtapaProps {
  etapa: Etapa
  estado: EstadoEtapa | undefined
  dataSaida: DadosPlano['viagem']['dataSaida']
  local: string
  editavel: boolean
  podeSubir: boolean
  podeDescer: boolean
  onAbrir: () => void
  onMover: (sentido: 'subir' | 'descer') => void
}

function LinhaEtapa({ etapa, estado, dataSaida, local, editavel, podeSubir, podeDescer, onAbrir, onMover }: LinhaEtapaProps) {
  // Origem mostra a saída; as demais, a chegada prevista.
  const instante = etapa.tipo === 'origem' ? estado?.saida?.instante : estado?.chegada?.instante
  const dias = instante ? diasDepois(instante, dataSaida) : 0
  const classe = etapa.tipo === 'flexivel' ? 'flex' : etapa.tipo === 'destino' ? 'fim' : ''
  return (
    <div className="etapa">
      <button type="button" className="etapa-principal" onClick={onAbrir} disabled={!editavel}>
        <span className="hora">
          {instante ? formatarHora(instante) : '—:—'}
          {dias > 0 && <small>+{dias} dia</small>}
        </span>
        <span className="corpo">
          <span className={`etiqueta ${classe}`}>{etiquetaDaEtapa(etapa.tipo, etapa.categoria)}</span>
          <span className="local">{local}</span>
          <span className="resumo">{resumoDaEtapa(etapa)}</span>
        </span>
      </button>
      {editavel && (
        <div className="mover">
          <button type="button" aria-label="Subir etapa" disabled={!podeSubir} onClick={() => onMover('subir')}>
            ▲
          </button>
          <button type="button" aria-label="Descer etapa" disabled={!podeDescer} onClick={() => onMover('descer')}>
            ▼
          </button>
        </div>
      )}
    </div>
  )
}

interface ContextoDeRotas {
  fator: number
  plano: DadosPlano
  /** Nomes dos locais do par que ainda não têm coordenadas (vazio = o par pode ser calculado). */
  faltaCoordenadas: (par: ParDeTrecho) => string[]
  onUsarRota: (par: ParDeTrecho) => void
  onManterManual: (par: ParDeTrecho) => void
}

interface TemposDasAlternativasProps {
  pares: ParDeAlternativas[]
  plano: DadosPlano
  editavel: boolean
  rotas: ContextoDeRotas
  onSalvar: (par: ParDeTrecho, minutos: number) => void
  onRemover: (par: ParDeTrecho) => void
}

/** Tempo de cada par de locais candidatos (alternativas) entre duas etapas vizinhas. */
function TemposDasAlternativas({ pares, plano, editavel, rotas, onSalvar, onRemover }: TemposDasAlternativasProps) {
  if (pares.length === 0) return null
  const semTempo = pares.filter((p) => p.duracao.minutos === null).length
  const nome = (id: string) => plano.locais.find((l) => l.id === id)?.nome ?? 'local'
  return (
    <details className="tempos-alternativas" open={semTempo > 0}>
      <summary>
        Tempos das alternativas
        {semTempo > 0 ? ` (${semTempo} sem tempo)` : ''}
      </summary>
      {pares.map(({ par, duracao }) => {
        const guardado = trechoDoPar(plano, par)
        const manual = guardado?.fonte === 'manual' ? guardado.duracaoMin : null
        return (
          <LinhaTrecho
            key={`${par.localOrigemId}>${par.localDestinoId}-${manual}`}
            rotulo={`${nome(par.localOrigemId)} → ${nome(par.localDestinoId)}`}
            trecho={duracao}
            editavel={editavel}
            pode
            duracaoManual={manual}
            guardado={guardado}
            rotas={rotas}
            par={par}
            onSalvar={(min) => onSalvar(par, min)}
            onRemover={() => onRemover(par)}
          />
        )
      })}
    </details>
  )
}

interface LinhaTrechoProps {
  /** Nome do par de locais, quando a linha não é o trecho principal entre as etapas. */
  rotulo?: string
  trecho: DuracaoTrecho | null
  editavel: boolean
  /** Os dois locais estão escolhidos: dá para digitar a duração. */
  pode: boolean
  duracaoManual: number | null
  /** O que está guardado para o par (rota, distância, data), se houver. */
  guardado?: Trecho
  rotas: ContextoDeRotas
  par: ParDeTrecho | null
  onSalvar: (minutos: number) => void
  onRemover: () => void
}

function LinhaTrecho({ rotulo, trecho, editavel, pode, duracaoManual, guardado, rotas, par, onSalvar, onRemover }: LinhaTrechoProps) {
  const [editando, setEditando] = useState(false)
  const inicial = horasEMinutosDe(duracaoManual ?? 0)
  const [horas, setHoras] = useState(duracaoManual ? inicial.horas : '')
  const [minutos, setMinutos] = useState(duracaoManual ? inicial.minutos : '')
  const [invalido, setInvalido] = useState(false)

  const semTempo = !trecho || trecho.minutos === null
  const manual = trecho?.fonte === 'manual'
  const daRota = trecho?.fonte === 'rota'
  const descricao = descreverTrecho(trecho, guardado, rotas.fator)
  const semCoordenadas = par ? rotas.faltaCoordenadas(par) : []

  function salvar() {
    const total = minutosDeHorasEMinutos(horas, minutos)
    if (total === null) return setInvalido(true)
    setInvalido(false)
    setEditando(false)
    onSalvar(total)
  }

  return (
    <div className={`trecho ${semTempo ? 'sem-tempo' : ''}`}>
      {rotulo && <span className="rotulo-trecho">{rotulo}</span>}
      {semTempo ? <strong>Sem tempo definido</strong> : (
        <>
          <span className="mono">{formatarDuracao(trecho.minutos)}</span>
          <span>{descricao.fonte}</span>
        </>
      )}
      {descricao.detalhes.length > 0 && (
        <span className="trecho-fonte">
          {descricao.detalhes.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </span>
      )}
      {semCoordenadas.length > 0 && (
        <span className="trecho-fonte">
          Sem coordenadas em {semCoordenadas.join(' e ')}: cadastre em Locais para calcular a rota.
        </span>
      )}
      {editavel && descricao.comparacao && par && (
        <div className="trecho-comparacao" role="group" aria-label="Escolher entre o seu tempo e a rota">
          <strong>{descricao.comparacao.texto}</strong>
          <button type="button" className="link" onClick={() => rotas.onUsarRota(par)}>
            Usar a rota
          </button>
          <button type="button" className="link" onClick={() => rotas.onManterManual(par)}>
            Manter o meu
          </button>
        </div>
      )}
      {editavel && (semTempo || manual || daRota) && !editando && (
        pode ? (
          <>
            <button type="button" className="link" onClick={() => setEditando(true)}>
              {semTempo ? 'Informar duração' : daRota ? 'Digitar o meu' : 'Editar'}
            </button>
            {manual && (
              <button type="button" className="link" onClick={onRemover}>
                Remover
              </button>
            )}
          </>
        ) : (
          <span>Escolha os locais das duas etapas para informar o tempo.</span>
        )
      )}
      {editando && (
        <div className="trecho-form">
          <input inputMode="numeric" aria-label="Horas" placeholder="h" value={horas} onChange={(e) => setHoras(e.target.value)} />
          <span>h</span>
          <input inputMode="numeric" aria-label="Minutos" placeholder="min" value={minutos} onChange={(e) => setMinutos(e.target.value)} />
          <span>min</span>
          <button type="button" className="botao pequeno principal" onClick={salvar}>
            Salvar
          </button>
          <button type="button" className="botao pequeno" onClick={() => setEditando(false)}>
            Cancelar
          </button>
          {invalido && <span className="msg-erro">Digite uma duração válida (minutos até 59).</span>}
        </div>
      )}
    </div>
  )
}


interface CampoFatorProps {
  plano: DadosPlano
  editavel: boolean
  salvar: (fator: number) => Promise<void>
}

/**
 * Fator ônibus da viagem (só no planejamento). Mostra a média dos fatores implícitos dos trechos
 * do roteiro com rota calculada como sugestão; ela só é aplicada quando a pessoa toca em "Usar".
 */
function CampoFatorOnibus({ plano, editavel, salvar }: CampoFatorProps) {
  const atual = plano.viagem.fatorOnibus
  const [texto, setTexto] = useState(formatarFator(atual))
  const [erro, setErro] = useState<string | null>(null)
  const sugestao: FatorSugerido | null = fatorSugeridoPeloRoteiro(plano)
  const sugerido = sugestao ? Math.round(sugestao.fator * 100) / 100 : null

  const digitado = lerFator(texto)
  const exemplo = plano.trechos.map((t) => (t.fonte === 'manual' ? t.rota : t.duracaoMin !== null ? { duracaoMin: t.duracaoMin } : null)).find((r) => r) ?? null

  async function confirmar(valor: number | null) {
    if (valor === null) return setErro('Digite o fator ônibus, por exemplo 1,15.')
    const motivo = validarFatorOnibus(valor)
    if (motivo) return setErro(motivo)
    setErro(null)
    if (Math.round(valor * 100) / 100 !== atual) await salvar(valor)
    setTexto(formatarFator(valor))
  }

  return (
    <div className={`campo ${erro ? 'erro' : ''}`}>
      <label htmlFor="v-fator">Fator ônibus</label>
      <input
        id="v-fator"
        inputMode="decimal"
        className="mono"
        value={texto}
        disabled={!editavel}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => editavel && void confirmar(digitado)}
        autoComplete="off"
      />
      {erro && <p className="msg-erro">{erro}</p>}
      <p className="dica">
        Multiplica o tempo de carro das rotas (de 1,00 a 2,00). Os tempos do roteiro e os digitados não mudam.
        {!editavel && ' Só pode ser mudado no planejamento.'}
        {exemplo && digitado !== null && !validarFatorOnibus(digitado) && ` Por exemplo: ${formatarDuracao(exemplo.duracaoMin)} de carro → ${formatarDuracao(aplicarFatorOnibus(exemplo.duracaoMin, digitado))} de ônibus.`}
      </p>
      {sugestao && sugerido !== null && (
        <div className="fator-sugestao">
          <span className="dica">
            Sugestão pelo roteiro: <strong className="mono">{formatarFator(sugerido)}</strong> (média de {sugestao.trechos}{' '}
            {sugestao.trechos === 1 ? 'trecho' : 'trechos'} com roteiro e rota).
          </span>
          {editavel && sugerido !== atual && (
            <button type="button" className="link" onClick={() => void confirmar(sugerido)}>
              Usar {formatarFator(sugerido)}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
