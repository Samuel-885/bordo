// Tela de planejamento da viagem: dados da viagem, etapas em ordem, trechos entre
// elas e o botão "Iniciar viagem". Nenhuma regra aqui: tudo vem do núcleo.

import { Fragment, useState } from 'react'
import { avisosDoPlano, horariosForaDeOrdem } from '../core/avisos'
import { calcularPlanoOriginal, estadosDoPlano } from '../core/previsao'
import { agora } from '../core/relogio'
import type { BloqueioInicio } from '../core/previsao'
import type { ParDeAlternativas, ParDeTrecho } from '../core/trechos'
import type { DadosPlano, DuracaoTrecho, Etapa, EstadoEtapa, Passageiro, TipoViagem } from '../core/tipos'
import type { Repositorio } from '../data/repositorio'
import { Confirmar } from './componentes/Confirmar'
import { Topo } from './componentes/Topo'
import { formatarDuracao, horasEMinutosDe, minutosDeHorasEMinutos } from './logica/duracao'
import { dataParaInstante, diasDepois, formatarData, formatarHora } from './logica/horarios'
import { etiquetaDaEtapa } from './logica/rotulos'
import { resumoDaEtapa, textoDoAviso, textoManuaisApagados, textoDoBloqueio, textoDaFonte, textoForaDeOrdem } from './logica/textos'
import { podeMover } from '../core/ordem'
import { paresDeTrechoDasAlternativas } from '../core/trechos'
import { textoTotalDePassageiros } from './logica/passageiros'
import { useDados } from './useDados'
import { mensagemDeErroDoBanco } from '../data/avisoBanco'

interface Props {
  repo: Repositorio
  viagemId: string
  onVoltar: () => void
  onEditarEtapa: (etapaId: string | null) => void
  onPassageiros: () => void
  onViagemExcluida: () => void
  /** Abre a tela principal da viagem (depois de iniciada). */
  onAbrirViagem: () => void
}

export function Planejamento({ repo, viagemId, onVoltar, onEditarEtapa, onPassageiros, onViagemExcluida, onAbrirViagem }: Props) {
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
      onVoltar={onVoltar}
      onEditarEtapa={onEditarEtapa}
      onPassageiros={onPassageiros}
      onViagemExcluida={onViagemExcluida}
      onAbrirViagem={onAbrirViagem}
    />
  )
}

interface ConteudoProps {
  plano: DadosPlano
  passageiros: Passageiro[]
  repo: Repositorio
  falha: string | null
  agir: (acao: () => Promise<unknown>) => Promise<void>
  onVoltar: () => void
  onEditarEtapa: (etapaId: string | null) => void
  onPassageiros: () => void
  onViagemExcluida: () => void
  onAbrirViagem: () => void
}

function Conteudo({ plano, passageiros, repo, falha, agir, onVoltar, onEditarEtapa, onPassageiros, onViagemExcluida, onAbrirViagem }: ConteudoProps) {
  const { viagem, etapas, locais } = plano
  const planejando = viagem.status === 'planejando'
  const estados = estadosDoPlano(plano)
  const avisos = avisosDoPlano(plano, estados, passageiros)
  const paresDasAlternativas = paresDeTrechoDasAlternativas(plano)
  const foraDeOrdem = horariosForaDeOrdem(plano)
  const calculo = calcularPlanoOriginal(plano, agora())
  const bloqueios: BloqueioInicio[] = calculo.ok ? [] : calculo.bloqueios
  const bloqueado = !calculo.ok || foraDeOrdem.length > 0 || !viagem.nome.trim()

  const [confirmarInicio, setConfirmarInicio] = useState(false)
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
    await agir(async () => {
      const r = await repo.iniciarViagem(viagem.id)
      setBloqueiosDoInicio(r.ok === false && r.motivo === 'bloqueios' ? r.bloqueios : [])
      if (r.ok) onAbrirViagem()
    })
  }

  return (
    <>
      <Topo titulo={viagem.nome || 'Planejamento'} onVoltar={onVoltar} rotuloVoltar="Voltar às viagens" />
      <main className="conteudo">
        {!planejando && <Iniciada plano={plano} onAbrir={onAbrirViagem} />}

        <DadosDaViagem key={viagem.id} plano={plano} editavel={planejando} salvar={(v) => agir(() => repo.salvarViagem(v))} />

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
            const manual = par
              ? plano.trechos.find(
                  (t) =>
                    t.etapaOrigemId === par.etapaOrigemId &&
                    t.localOrigemId === par.localOrigemId &&
                    t.etapaDestinoId === par.etapaDestinoId &&
                    t.localDestinoId === par.localDestinoId,
                )?.duracaoMin ?? null
              : null
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
                    onSalvar={(min) => agir(() => repo.salvarTrechoManual(viagem.id, par!, min))}
                    onRemover={() => agir(() => repo.removerTrecho(viagem.id, par!))}
                  />
                )}
                {estadoProximo && (
                  <TemposDasAlternativas
                    pares={paresDasAlternativas.filter((p) => p.par.etapaOrigemId === etapa.id)}
                    plano={plano}
                    editavel={planejando}
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

        <section className="cartao" aria-label="Passageiros">
          <h2>Passageiros</h2>
          <p className="linha-grande">{passageiros.length === 0 ? 'Nenhum cadastrado' : textoTotalDePassageiros(passageiros.length)}</p>
          <p className="dica">Os nomes ficam só neste celular.</p>
          <button type="button" className="botao largo" onClick={onPassageiros}>
            {planejando ? 'Cadastrar passageiros' : 'Ver passageiros'}
          </button>
        </section>

        {falha && <p className="msg-erro">{falha}</p>}

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

            <button type="button" className="botao principal largo" disabled={bloqueado} onClick={() => setConfirmarInicio(true)}>
              Iniciar viagem
            </button>
            <p className="congelar">Ao iniciar, este planejamento vira a expectativa original e fica congelado.</p>
          </>
        )}

        {planejando && (
          <button type="button" className="botao perigo largo" onClick={() => setConfirmarExclusao(true)}>
            Excluir viagem
          </button>
        )}
      </main>

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
        titulo="Iniciar a viagem?"
        rotuloConfirmar="Iniciar viagem"
        onCancelar={() => setConfirmarInicio(false)}
        onConfirmar={iniciar}
      >
        <p>O planejamento fica congelado como a expectativa original e não poderá mais ser editado.</p>
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
}: {
  plano: DadosPlano
  editavel: boolean
  salvar: (v: DadosPlano['viagem']) => Promise<void>
}) {
  const { viagem } = plano
  const [nome, setNome] = useState(viagem.nome)
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

interface TemposDasAlternativasProps {
  pares: ParDeAlternativas[]
  plano: DadosPlano
  editavel: boolean
  onSalvar: (par: ParDeTrecho, minutos: number) => void
  onRemover: (par: ParDeTrecho) => void
}

/** Tempo de cada par de locais candidatos (alternativas) entre duas etapas vizinhas. */
function TemposDasAlternativas({ pares, plano, editavel, onSalvar, onRemover }: TemposDasAlternativasProps) {
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
        const manual =
          plano.trechos.find(
            (t) =>
              t.etapaOrigemId === par.etapaOrigemId &&
              t.localOrigemId === par.localOrigemId &&
              t.etapaDestinoId === par.etapaDestinoId &&
              t.localDestinoId === par.localDestinoId,
          )?.duracaoMin ?? null
        return (
          <LinhaTrecho
            key={`${par.localOrigemId}>${par.localDestinoId}-${manual}`}
            rotulo={`${nome(par.localOrigemId)} → ${nome(par.localDestinoId)}`}
            trecho={duracao}
            editavel={editavel}
            pode
            duracaoManual={manual}
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
  onSalvar: (minutos: number) => void
  onRemover: () => void
}

function LinhaTrecho({ rotulo, trecho, editavel, pode, duracaoManual, onSalvar, onRemover }: LinhaTrechoProps) {
  const [editando, setEditando] = useState(false)
  const inicial = horasEMinutosDe(duracaoManual ?? 0)
  const [horas, setHoras] = useState(duracaoManual ? inicial.horas : '')
  const [minutos, setMinutos] = useState(duracaoManual ? inicial.minutos : '')
  const [invalido, setInvalido] = useState(false)

  const semTempo = !trecho || trecho.minutos === null
  const manual = trecho?.fonte === 'manual'

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
          <span>{textoDaFonte(trecho.fonte)}</span>
        </>
      )}
      {editavel && (semTempo || manual) && !editando && (
        pode ? (
          <>
            <button type="button" className="link" onClick={() => setEditando(true)}>
              {semTempo ? 'Informar duração' : 'Editar'}
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

