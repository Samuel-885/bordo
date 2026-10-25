// Formulário de etapa. O estado do formulário vive aqui, por isso "+ Novo local"
// pode abrir a tela do local por cima sem perder o que já foi preenchido.

import { useMemo, useState } from 'react'
import type { DadosPlano, Local, TipoEtapa } from '../core/tipos'
import type { Repositorio } from '../data/repositorio'
import { novoId } from '../data/repositorio'
import { Confirmar } from './componentes/Confirmar'
import { Topo } from './componentes/Topo'
import { FormLocal } from './FormLocal'
import {
  adicionarCandidato,
  etapaDoFormulario,
  formularioDaEtapa,
  formularioVazio,
  permanenciaEhDaLista,
  previaDaEtapa,
  removerCandidato,
  trocarTipo,
  validarFormulario,
  type ErrosEtapa,
  type FormEtapa,
} from './logica/formEtapa'
import { diasDepois, formatarHora } from './logica/horarios'
import { CATEGORIAS, MOTIVOS, PERMANENCIAS_MIN, TIPOS_DE_ETAPA } from './logica/rotulos'
import { formatarDuracao } from './logica/duracao'
import { textoManuaisApagados } from './logica/textos'
import { useDados } from './useDados'
import { mensagemDeErroDoBanco } from '../data/avisoBanco'

interface Props {
  repo: Repositorio
  viagemId: string
  /** Vazio: etapa nova. */
  etapaId: string | null
  onFechar: () => void
}

type AlvoNovoLocal = 'local' | 'candidato'

export function EditorEtapa({ repo, viagemId, etapaId, onFechar }: Props) {
  const { dados: plano, erro } = useDados(async () => {
    const p = await repo.carregarPlano(viagemId)
    if (!p) throw new Error('Viagem não encontrada.')
    return p
  }, `${repo.espaco}:${viagemId}`)
  const [locais, setLocais] = useState<Local[] | null>(null)

  if (erro) return <Mensagem texto={erro} onVoltar={onFechar} />
  if (!plano) return <Topo titulo="Etapa" onVoltar={onFechar} />

  return (
    <Formulario
      key={etapaId ?? 'nova'}
      repo={repo}
      plano={plano}
      etapaId={etapaId}
      locais={locais ?? plano.locais}
      onLocais={setLocais}
      onFechar={onFechar}
    />
  )
}

function Mensagem({ texto, onVoltar }: { texto: string; onVoltar: () => void }) {
  return (
    <>
      <Topo titulo="Etapa" onVoltar={onVoltar} />
      <main className="conteudo">
        <p className="msg-erro">{texto}</p>
      </main>
    </>
  )
}

interface FormularioProps {
  repo: Repositorio
  plano: DadosPlano
  etapaId: string | null
  locais: Local[]
  onLocais: (l: Local[]) => void
  onFechar: () => void
}

function Formulario({ repo, plano, etapaId, locais, onLocais, onFechar }: FormularioProps) {
  const existente = plano.etapas.find((e) => e.id === etapaId)
  const [id] = useState(() => existente?.id ?? novoId())
  const [f, setF] = useState<FormEtapa>(() => {
    if (existente) return formularioDaEtapa(existente)
    const temOrigem = plano.etapas.some((e) => e.tipo === 'origem')
    return formularioVazio(temOrigem ? 'flexivel' : 'origem')
  })
  const [erros, setErros] = useState<ErrosEtapa>({})
  const [falha, setFalha] = useState<string | null>(null)
  const [novoLocalPara, setNovoLocalPara] = useState<AlvoNovoLocal | null>(null)
  const [confirmarDia, setConfirmarDia] = useState(false)
  const [confirmarExclusao, setConfirmarExclusao] = useState(false)
  /** Quantos tempos digitados à mão o Salvar ou o Excluir apagaria; 0 = não pergunta. */
  const [apagadosAoSalvar, setApagadosAoSalvar] = useState<number | null>(null)
  const [apagadosAoExcluir, setApagadosAoExcluir] = useState(0)

  const dataSaida = plano.viagem.dataSaida
  const outras = useMemo(() => plano.etapas.filter((e) => e.id !== id), [plano.etapas, id])
  const convertida = useMemo(
    () => etapaDoFormulario(f, { id, viagemId: plano.viagem.id, dataSaida, ordem: existente?.ordem, outras }),
    [f, id, plano.viagem.id, dataSaida, existente?.ordem, outras],
  )
  const previa = useMemo(() => previaDaEtapa({ ...plano, locais }, convertida.etapa), [plano, locais, convertida.etapa])

  const muda = <K extends keyof FormEtapa>(campo: K, valor: FormEtapa[K]) => setF((atual) => ({ ...atual, [campo]: valor }))
  const nomeDoLocal = (localId: string) => locais.find((l) => l.id === localId)
  const ordenados = useMemo(() => [...locais].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')), [locais])

  const origemExiste = outras.some((e) => e.tipo === 'origem')
  const destinoExiste = outras.some((e) => e.tipo === 'destino')
  const viradaChegada = convertida.viradas.some((v) => v.campo === 'chegada')
  const viradaJanela = convertida.viradas.some((v) => v.campo === 'janelaFim')

  async function persistir() {
    try {
      await repo.salvarEtapa(convertida.etapa)
      onFechar()
    } catch (x) {
      setFalha(mensagemDeErroDoBanco(x, 'Não foi possível salvar a etapa.'))
    }
  }

  /** Antes de gravar: se apagaria tempos digitados à mão, pergunta. */
  async function gravarComConfirmacao() {
    try {
      const apagados = await repo.contarManuaisApagadosAoSalvar(convertida.etapa)
      if (apagados > 0) setApagadosAoSalvar(apagados)
      else await persistir()
    } catch (x) {
      setFalha(mensagemDeErroDoBanco(x, 'Não foi possível salvar a etapa.'))
    }
  }

  function salvar() {
    const e = validarFormulario(f)
    setErros(e)
    if (Object.keys(e).length > 0) return
    if (convertida.viradas.length > 0) setConfirmarDia(true)
    else void gravarComConfirmacao()
  }

  async function pedirExclusao() {
    try {
      setApagadosAoExcluir(await repo.contarManuaisApagadosAoExcluir(id))
      setConfirmarExclusao(true)
    } catch (x) {
      setFalha(mensagemDeErroDoBanco(x, 'Não foi possível excluir a etapa.'))
    }
  }

  async function excluir() {
    try {
      await repo.excluirEtapa(id)
      onFechar()
    } catch (x) {
      setConfirmarExclusao(false)
      setFalha(mensagemDeErroDoBanco(x, 'Não foi possível excluir a etapa.'))
    }
  }

  async function salvarNovoLocal(local: Local) {
    await repo.salvarLocal(local)
    onLocais(await repo.listarLocais())
    if (novoLocalPara === 'local') muda('localId', local.id)
    else setF((atual) => adicionarCandidato(atual, local.id))
    setNovoLocalPara(null)
  }

  if (novoLocalPara) return <FormLocal locaisDeReferencia={locais} onSalvar={salvarNovoLocal} onCancelar={() => setNovoLocalPara(null)} />

  const ehOrigem = f.tipo === 'origem'
  const ehObrigatoria = f.tipo === 'obrigatoria'
  const ehFlexivel = f.tipo === 'flexivel'
  const mostraSaida = ehObrigatoria || ehFlexivel

  return (
    <>
      <Topo titulo={existente ? 'Editar etapa' : 'Nova etapa'} onVoltar={onFechar} rotuloVoltar="Voltar ao planejamento" />
      <main className="conteudo">
        <section className="cartao">
          <div className="campo">
            <label htmlFor="e-tipo">Tipo</label>
            <select id="e-tipo" value={f.tipo} onChange={(e) => setF(trocarTipo(f, e.target.value as TipoEtapa))}>
              {TIPOS_DE_ETAPA.map((t) => (
                <option
                  key={t.valor}
                  value={t.valor}
                  disabled={(t.valor === 'origem' && origemExiste) || (t.valor === 'destino' && destinoExiste)}
                >
                  {t.rotulo}
                </option>
              ))}
            </select>
          </div>

          {ehObrigatoria && (
            <p className="dica">Ponto obrigatório não pode ser pulado durante a viagem.</p>
          )}
        </section>

        <section className="cartao">
          {!ehFlexivel && (
            <div className={`campo ${erros.local ? 'erro' : ''}`}>
              <label htmlFor="e-local">Local</label>
              <select id="e-local" value={f.localId} onChange={(e) => muda('localId', e.target.value)}>
                <option value="">Escolha o local</option>
                {ordenados.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome} — {l.cidade}
                  </option>
                ))}
              </select>
              {erros.local && <p className="msg-erro">{erros.local}</p>}
              <button type="button" className="link" onClick={() => setNovoLocalPara('local')} style={{ alignSelf: 'flex-start' }}>
                + Novo local
              </button>
            </div>
          )}

          {ehObrigatoria && (
            <div className={`campo ${erros.motivo ? 'erro' : ''}`}>
              <label htmlFor="e-motivo">Motivo</label>
              <select id="e-motivo" value={f.motivo} onChange={(e) => muda('motivo', e.target.value)}>
                <option value="">Escolha o motivo</option>
                {MOTIVOS.map((m) => (
                  <option key={m.valor} value={m.valor}>
                    {m.rotulo}
                  </option>
                ))}
              </select>
              {erros.motivo && <p className="msg-erro">{erros.motivo}</p>}
            </div>
          )}

          {ehFlexivel && (
            <div className={`campo ${erros.categoria ? 'erro' : ''}`}>
              <label htmlFor="e-categoria">Categoria</label>
              <select id="e-categoria" value={f.categoria} onChange={(e) => muda('categoria', e.target.value)}>
                <option value="">Escolha a categoria</option>
                {CATEGORIAS.map((c) => (
                  <option key={c.valor} value={c.valor}>
                    {c.rotulo}
                  </option>
                ))}
              </select>
              {erros.categoria && <p className="msg-erro">{erros.categoria}</p>}
            </div>
          )}
        </section>

        {ehFlexivel && (
          <section className="cartao">
            <h2>Janela ideal</h2>
            <div className="linha-campos">
              <div className="campo">
                <label htmlFor="e-j-ini">Início</label>
                <input id="e-j-ini" type="time" value={f.janelaInicio} onChange={(e) => muda('janelaInicio', e.target.value)} />
              </div>
              <div className="campo">
                <label htmlFor="e-j-fim">
                  Fim{viradaJanela && <span className="marca-dia">+1 dia</span>}
                </label>
                <input id="e-j-fim" type="time" value={f.janelaFim} onChange={(e) => muda('janelaFim', e.target.value)} />
              </div>
            </div>
            {erros.janela && <p className="msg-erro">{erros.janela}</p>}
          </section>
        )}

        <section className="cartao">
          <div className="campo">
            <label htmlFor="e-hora">
              {ehOrigem ? 'Horário de saída' : f.tipo === 'destino' ? 'Chegada prevista' : 'Chegada prevista (opcional)'}
              {viradaChegada && <span className="marca-dia">+1 dia</span>}
            </label>
            <input id="e-hora" type="time" value={f.hora} onChange={(e) => muda('hora', e.target.value)} />
            {ehFlexivel && <p className="dica">Vale para o local preferido.</p>}
            {!f.hora && !ehOrigem && <p className="dica">Sem horário, a chegada é calculada pelo tempo do trecho.</p>}
          </div>

          {mostraSaida && (
            <>
              <Permanencia valor={f.permanenciaMin} erro={erros.permanencia} onMudar={(m) => muda('permanenciaMin', m)} />
              <div className="campo">
                <span className="rotulo">Saída prevista</span>
                <div className="somente-leitura" aria-live="polite">
                  {previa.saida ? (
                    <>
                      {formatarHora(previa.saida)}
                      {diasDepois(previa.saida, dataSaida) > 0 && <span className="marca-dia">+1 dia</span>}
                    </>
                  ) : (
                    '—:—'
                  )}
                </div>
                {!previa.saida && <p className="dica">Aparece quando a chegada tem horário ou o trecho tem tempo.</p>}
              </div>
            </>
          )}
        </section>

        {ehFlexivel && (
          <section className="cartao">
            <h2>Locais</h2>
            {f.candidatos.length === 0 && <p className="dica">Nenhum local escolhido: a viagem pode começar, mas com aviso.</p>}
            {f.candidatos.map((cid) => {
              const l = nomeDoLocal(cid)
              return (
                <div className="alternativa" key={cid}>
                  <label>
                    <input type="radio" name="preferido" checked={f.preferido === cid} onChange={() => muda('preferido', cid)} />
                    <span>
                      {l?.nome ?? 'Local removido'}
                      <small>{f.preferido === cid ? 'Preferido' : 'Alternativa'}{l ? ` · ${l.cidade}` : ''}</small>
                    </span>
                  </label>
                  <button type="button" className="botao pequeno perigo" onClick={() => setF(removerCandidato(f, cid))}>
                    Remover
                  </button>
                </div>
              )
            })}
            <div className="campo">
              <label htmlFor="e-add">Adicionar do catálogo</label>
              <select
                id="e-add"
                value=""
                onChange={(e) => setF(adicionarCandidato(f, e.target.value))}
              >
                <option value="">Escolha um local</option>
                {ordenados
                  .filter((l) => !f.candidatos.includes(l.id))
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nome} — {l.cidade}
                    </option>
                  ))}
              </select>
              <button type="button" className="link" onClick={() => setNovoLocalPara('candidato')} style={{ alignSelf: 'flex-start' }}>
                + Novo local
              </button>
            </div>
          </section>
        )}

        {falha && <p className="msg-erro">{falha}</p>}
        <div className="acoes">
          <button type="button" className="botao principal" onClick={salvar}>
            Salvar
          </button>
          {existente && (
            <button type="button" className="botao perigo" onClick={() => void pedirExclusao()}>
              Excluir
            </button>
          )}
        </div>
      </main>

      <Confirmar
        aberto={confirmarDia}
        titulo="Passa da meia-noite?"
        rotuloConfirmar="Confirmar +1 dia"
        onCancelar={() => setConfirmarDia(false)}
        onConfirmar={() => {
          setConfirmarDia(false)
          void gravarComConfirmacao()
        }}
      >
        <p>
          {viradaChegada && 'A chegada é menor que o horário da etapa anterior, então ficará no dia seguinte. '}
          {viradaJanela && 'O fim da janela é menor que o início, então ficará no dia seguinte. '}
          Está certo?
        </p>
      </Confirmar>

      <Confirmar
        aberto={confirmarExclusao}
        titulo="Excluir etapa?"
        perigo
        rotuloConfirmar="Excluir etapa"
        onCancelar={() => setConfirmarExclusao(false)}
        onConfirmar={excluir}
      >
        <p>
          {apagadosAoExcluir > 0
            ? `Também serão apagados ${textoManuaisApagados(apagadosAoExcluir)} que ligavam esta etapa.`
            : 'Esta etapa será removida do planejamento.'}
        </p>
      </Confirmar>

      <Confirmar
        aberto={apagadosAoSalvar !== null}
        titulo="Apagar tempos digitados?"
        perigo
        rotuloConfirmar="Salvar e apagar"
        onCancelar={() => setApagadosAoSalvar(null)}
        onConfirmar={() => {
          setApagadosAoSalvar(null)
          void persistir()
        }}
      >
        <p>
          Esta alteração apaga {apagadosAoSalvar !== null ? textoManuaisApagados(apagadosAoSalvar) : ''}, porque o local
          ou a posição deixou de valer. Você terá de digitar de novo.
        </p>
      </Confirmar>
    </>
  )
}

function Permanencia({ valor, erro, onMudar }: { valor: number; erro?: string; onMudar: (m: number) => void }) {
  const [outro, setOutro] = useState(() => !permanenciaEhDaLista(valor))
  return (
    <div className={`campo ${erro ? 'erro' : ''}`}>
      <label htmlFor="e-perm">Permanência</label>
      <select
        id="e-perm"
        value={outro ? 'outro' : String(valor)}
        onChange={(e) => {
          if (e.target.value === 'outro') setOutro(true)
          else {
            setOutro(false)
            onMudar(Number(e.target.value))
          }
        }}
      >
        {PERMANENCIAS_MIN.map((m) => (
          <option key={m} value={m}>
            {formatarDuracao(m)}
          </option>
        ))}
        <option value="outro">Outro…</option>
      </select>
      {outro && (
        <input
          type="number"
          inputMode="numeric"
          min={1}
          aria-label="Permanência em minutos"
          placeholder="Minutos"
          value={Number.isFinite(valor) && valor > 0 ? valor : ''}
          onChange={(e) => onMudar(e.target.value === '' ? 0 : Number(e.target.value))}
        />
      )}
      {erro && <p className="msg-erro">{erro}</p>}
    </div>
  )
}
