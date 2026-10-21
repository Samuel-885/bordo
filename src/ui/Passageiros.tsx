// Cadastro de passageiros: nome, embarque e desembarque. Lista agrupada por ponto de
// embarque. Planejando vale tudo; com a viagem em andamento dá para adicionar alguém de
// última hora e corrigir nomes (as regras vêm do núcleo). Os dados ficam só no celular.

import { useState } from 'react'
import { etapasDeDesembarque, etapasDeEmbarque, etapasJaDeixadas } from '../core/passageiros'
import { ordenarPor } from '../core/tempo'
import type { Etapa, Evento, Local, Passageiro, StatusPassageiro } from '../core/tipos'
import type { Repositorio } from '../data/repositorio'
import { Confirmar } from './componentes/Confirmar'
import { Folha } from './componentes/Folha'
import { Topo } from './componentes/Topo'
import { agruparPorEmbarque, DICA_DO_NOME, NOTA_DE_PRIVACIDADE, textoTotalDePassageiros } from './logica/passageiros'
import { STATUS_DE_PASSAGEIRO } from './logica/rotulos'
import { nomeDaEtapa } from './logica/textos'
import { useDados } from './useDados'
import { mensagemDeErroDoBanco } from '../data/avisoBanco'

interface Props {
  repo: Repositorio
  viagemId: string
  onVoltar: () => void
}

export function Passageiros({ repo, viagemId, onVoltar }: Props) {
  const { dados, erro, recarregar } = useDados(async () => {
    const [plano, passageiros, eventos] = await Promise.all([
      repo.carregarPlano(viagemId),
      repo.listarPassageiros(viagemId),
      repo.listarEventos(viagemId),
    ])
    return { plano, passageiros, eventos }
  }, `passageiros:${repo.espaco}:${viagemId}`)

  if (erro || (dados && !dados.plano)) {
    return (
      <>
        <Topo titulo="Passageiros" onVoltar={onVoltar} />
        <main className="conteudo"><p className="msg-erro">{erro ?? 'Viagem não encontrada.'}</p></main>
      </>
    )
  }
  if (!dados?.plano) return <Topo titulo="Passageiros" onVoltar={onVoltar} />
  return (
    <Conteudo
      repo={repo}
      etapas={dados.plano.etapas}
      locais={dados.plano.locais}
      statusViagem={dados.plano.viagem.status}
      passageiros={dados.passageiros}
      eventos={dados.eventos}
      recarregar={recarregar}
      onVoltar={onVoltar}
    />
  )
}

interface ConteudoProps {
  repo: Repositorio
  etapas: Etapa[]
  locais: Local[]
  statusViagem: 'planejando' | 'em_andamento' | 'concluida'
  passageiros: Passageiro[]
  eventos: Evento[]
  recarregar: () => void
  onVoltar: () => void
}

/** Status atual de cada passageiro, lido dos eventos (nunca guardado no cadastro). */
function statusAtual(passageiroId: string, eventos: readonly Evento[]): StatusPassageiro {
  const ultimo = ordenarPor(
    eventos.filter((e) => e.tipo === 'status_passageiro' && e.dados.passageiroId === passageiroId),
    (e) => e.horarioFato,
  ).at(-1)
  return ultimo?.tipo === 'status_passageiro' ? ultimo.dados.status : 'ativo'
}

function Conteudo({ repo, etapas, locais, statusViagem, passageiros, eventos, recarregar, onVoltar }: ConteudoProps) {
  const [editando, setEditando] = useState<{ passageiro: Passageiro | null } | null>(null)
  const [excluindo, setExcluindo] = useState<Passageiro | null>(null)
  const [falha, setFalha] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const grupos = agruparPorEmbarque(etapas, locais, passageiros)
  const editavel = statusViagem !== 'concluida'
  const nomeEtapa = (id: string) => nomeDaEtapa(etapas.find((e) => e.id === id), locais)

  async function salvar(dados: { nome: string; etapaEmbarqueId: string; etapaDesembarqueId: string | null }) {
    setOcupado(true)
    setFalha(null)
    try {
      await repo.salvarPassageiro(viagemDe(etapas), dados, editando?.passageiro?.id)
      setEditando(null)
      recarregar()
    } catch (x) {
      setFalha(mensagemDeErroDoBanco(x, 'Não foi possível salvar.'))
    } finally {
      setOcupado(false)
    }
  }

  async function excluir() {
    const alvo = excluindo
    if (!alvo) return
    setExcluindo(null)
    try {
      await repo.excluirPassageiro(alvo.id)
      setEditando(null)
      recarregar()
    } catch (x) {
      setFalha(mensagemDeErroDoBanco(x, 'Não foi possível excluir.'))
    }
  }

  return (
    <>
      <Topo titulo="Passageiros" onVoltar={onVoltar} />
      <main className="conteudo">
        <section className="cartao" aria-label="Resumo">
          <p className="linha-grande"><strong>{textoTotalDePassageiros(passageiros.length)}</strong></p>
          {grupos.length > 0 && (
            <ul className="resumo-embarques">
              {grupos.map((g) => (
                <li key={g.etapaId}>
                  {g.nome}: <span className="mono">{g.passageiros.length}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="dica">{NOTA_DE_PRIVACIDADE}</p>
          {statusViagem === 'em_andamento' && (
            <p className="dica">Viagem em andamento: dá para adicionar alguém de última hora em um ponto de onde ainda não saímos.</p>
          )}
        </section>

        {editavel && (
          <button type="button" className="botao principal largo" onClick={() => { setFalha(null); setEditando({ passageiro: null }) }}>
            Adicionar passageiro
          </button>
        )}
        {falha && !editando && <p className="msg-erro" role="alert">{falha}</p>}

        {passageiros.length === 0 && <p className="dica">Nenhum passageiro cadastrado.</p>}

        {grupos.map((g) => (
          <section key={g.etapaId} className="cartao" aria-label={`Embarque: ${g.nome}`}>
            <h2>Embarca em {g.nome} · {g.passageiros.length}</h2>
            <ul className="lista-passageiros">
              {g.passageiros.map((p) => {
                const status = statusAtual(p.id, eventos)
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="linha-passageiro"
                      disabled={!editavel}
                      onClick={() => { setFalha(null); setEditando({ passageiro: p }) }}
                    >
                      <span>{p.nome}</span>
                      <small>
                        {p.etapaDesembarqueId ? `desce em ${nomeEtapa(p.etapaDesembarqueId)}` : 'vai até o destino'}
                        {status !== 'ativo' && ` · ${STATUS_DE_PASSAGEIRO[status]}`}
                      </small>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </main>

      {editando && (
        <FormularioPassageiro
          key={editando.passageiro?.id ?? 'novo'}
          atual={editando.passageiro}
          etapas={etapas}
          locais={locais}
          deixadas={statusViagem === 'em_andamento' ? etapasJaDeixadas(eventos) : new Set()}
          ocupado={ocupado}
          erro={falha}
          onSalvar={(d) => void salvar(d)}
          onExcluir={editando.passageiro ? () => setExcluindo(editando.passageiro) : undefined}
          onCancelar={() => setEditando(null)}
        />
      )}

      <Confirmar
        aberto={excluindo !== null}
        titulo="Excluir passageiro?"
        perigo
        rotuloConfirmar="Excluir"
        onCancelar={() => setExcluindo(null)}
        onConfirmar={() => void excluir()}
      >
        <p>{excluindo?.nome} sai da lista. Isso não dá para desfazer.</p>
      </Confirmar>
    </>
  )
}

/** Todas as etapas são da mesma viagem. */
function viagemDe(etapas: readonly Etapa[]): string {
  return etapas[0]!.viagemId
}

interface FormProps {
  atual: Passageiro | null
  etapas: Etapa[]
  locais: Local[]
  /** Etapas de onde o ônibus já saiu (viagem em andamento): não aceitam escolha nova. */
  deixadas: ReadonlySet<string>
  ocupado: boolean
  erro: string | null
  onSalvar: (dados: { nome: string; etapaEmbarqueId: string; etapaDesembarqueId: string | null }) => void
  onExcluir?: () => void
  onCancelar: () => void
}

function FormularioPassageiro({ atual, etapas, locais, deixadas, ocupado, erro, onSalvar, onExcluir, onCancelar }: FormProps) {
  const embarques = etapasDeEmbarque(etapas)
  const desembarques = etapasDeDesembarque(etapas)
  const destino = desembarques.find((e) => e.tipo === 'destino')
  const primeiroLivre = embarques.find((e) => !deixadas.has(e.id)) ?? embarques[0]
  const [nome, setNome] = useState(atual?.nome ?? '')
  const [embarque, setEmbarque] = useState(atual?.etapaEmbarqueId ?? primeiroLivre?.id ?? '')
  /** Vazio = destino (o padrão). */
  const [desembarque, setDesembarque] = useState(atual?.etapaDesembarqueId ?? '')
  const rotulo = (e: Etapa) => nomeDaEtapa(e, locais)

  return (
    <Folha
      aberta
      titulo={atual ? 'Editar passageiro' : 'Novo passageiro'}
      rotuloConfirmar="Salvar"
      ocupado={ocupado}
      erro={erro}
      podeConfirmar={nome.trim() !== '' && embarque !== ''}
      onCancelar={onCancelar}
      onConfirmar={() => onSalvar({ nome, etapaEmbarqueId: embarque, etapaDesembarqueId: desembarque === '' ? null : desembarque })}
    >
      <div className="campo">
        <label htmlFor="p-nome">Nome</label>
        <input id="p-nome" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="off" autoFocus />
        <small className="dica">{DICA_DO_NOME}</small>
      </div>
      <div className="campo">
        <label htmlFor="p-embarque">Embarque</label>
        <select id="p-embarque" value={embarque} onChange={(e) => setEmbarque(e.target.value)}>
          {embarques.map((e) => (
            <option key={e.id} value={e.id} disabled={deixadas.has(e.id) && e.id !== atual?.etapaEmbarqueId}>
              {rotulo(e)}
            </option>
          ))}
        </select>
      </div>
      <div className="campo">
        <label htmlFor="p-desembarque">Desembarque</label>
        <select id="p-desembarque" value={desembarque} onChange={(e) => setDesembarque(e.target.value)}>
          {destino && <option value="">{rotulo(destino)} (padrão)</option>}
          {desembarques
            .filter((e) => e.tipo !== 'destino')
            .map((e) => (
              <option key={e.id} value={e.id} disabled={deixadas.has(e.id) && e.id !== atual?.etapaDesembarqueId}>
                {rotulo(e)}
              </option>
            ))}
        </select>
      </div>
      {onExcluir && (
        <button type="button" className="botao perigo largo" onClick={onExcluir}>
          Excluir passageiro
        </button>
      )}
    </Folha>
  )
}
