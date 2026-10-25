// Catálogo de locais: lista, novo, editar e excluir. A exclusão usa a trava do repositório
// (LocalEmUso): em uso, a tela diz onde o local está sendo usado e não exclui.

import { useState } from 'react'
import type { Local } from '../core/tipos'
import { mensagemDeErroDoBanco } from '../data/avisoBanco'
import { LocalEmUso, type Repositorio } from '../data/repositorio'
import { Confirmar } from './componentes/Confirmar'
import { Envoltorio } from './componentes/Envoltorio'
import { Topo } from './componentes/Topo'
import { FormLocal } from './FormLocal'
import { ONIBUS_PARA, TIPOS_DE_LOCAL, rotuloDe } from './logica/rotulos'
import { usosDoLocal } from './logica/usoDoLocal'
import { useAoMudar } from './useAgora'
import { useDados } from './useDados'

interface Props {
  repo: Repositorio
  /** Abre o formulário (tela própria): um local existente ou, com `null`, um novo. */
  onEditar: (localId: string | null) => void
  onVoltar?: () => void
  /** Dentro da aba Locais: sem cabeçalho nem margens próprias. */
  incorporada?: boolean
}

export function Locais({ repo, onEditar, onVoltar, incorporada }: Props) {
  const { dados: locais, erro, recarregar } = useDados(() => repo.listarLocais(), `locais:${repo.espaco}`)
  useAoMudar(recarregar)
  const [excluindo, setExcluindo] = useState<Local | null>(null)
  const [emUso, setEmUso] = useState<{ local: Local; usos: string[] } | null>(null)
  const [falha, setFalha] = useState<string | null>(null)

  /** Onde o local aparece, em todas as viagens do espaço. */
  async function usosDe(local: Local): Promise<string[]> {
    const viagens = await repo.listarViagens()
    const planos = await Promise.all(viagens.map((v) => repo.carregarPlano(v.id)))
    return usosDoLocal(
      local.id,
      planos.flatMap((p) => (p ? [{ viagem: p.viagem, etapas: p.etapas, locais: p.locais }] : [])),
    )
  }

  async function pedirExclusao(local: Local) {
    setFalha(null)
    try {
      const usos = await usosDe(local)
      if (usos.length > 0) setEmUso({ local, usos })
      else setExcluindo(local)
    } catch (x) {
      setFalha(mensagemDeErroDoBanco(x, 'Não foi possível verificar o uso do local.'))
    }
  }

  async function excluir() {
    const alvo = excluindo
    if (!alvo) return
    setExcluindo(null)
    try {
      await repo.excluirLocal(alvo.id)
      recarregar()
    } catch (x) {
      if (x instanceof LocalEmUso) setEmUso({ local: alvo, usos: await usosDe(alvo) })
      else setFalha(mensagemDeErroDoBanco(x, 'Não foi possível excluir o local.'))
    }
  }

  const ordenados = [...(locais ?? [])].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  return (
    <>
      {!incorporada && <Topo titulo="Locais" onVoltar={onVoltar} />}
      <Envoltorio incorporada={incorporada}>
        {erro && <p className="msg-erro">{erro}</p>}
        {falha && <p className="msg-erro" role="alert">{falha}</p>}
        <button type="button" className="botao principal largo" onClick={() => onEditar(null)}>
          Novo local
        </button>
        {locais?.length === 0 && <p className="dica">Nenhum local ainda. Toque em “Novo local” para começar.</p>}
        <ul className="lista-locais">
          {ordenados.map((l) => (
            <li key={l.id} className="local-item" data-teste="local">
              <button type="button" className="local-principal" onClick={() => onEditar(l.id)} aria-label={`Editar ${l.nome}`}>
                <strong>{l.nome}</strong>
                <span className="local-detalhe">
                  {l.cidade} · {rotuloDe(TIPOS_DE_LOCAL, l.tipo)}
                  {l.marcacao && <span className={`marca-local ${l.marcacao}`}>{l.marcacao === 'favorito' ? 'Favorito' : 'Evitar'}</span>}
                </span>
                <span className="local-detalhe">
                  {l.abre && l.fecha ? (
                    <>
                      Abre <span className="mono">{l.abre}</span> · fecha <span className="mono">{l.fecha}</span>
                    </>
                  ) : (
                    'Sem horário de funcionamento'
                  )}
                  {' · '}
                  {l.coordenadas ? 'com coordenadas' : 'sem coordenadas'}
                  {l.onibusPara !== 'nao_sei' && ` · ônibus ${rotuloDe(ONIBUS_PARA, l.onibusPara).toLowerCase()}`}
                </span>
              </button>
              <button type="button" className="botao pequeno perigo" onClick={() => void pedirExclusao(l)} aria-label={`Excluir ${l.nome}`}>
                Excluir
              </button>
            </li>
          ))}
        </ul>
      </Envoltorio>

      <Confirmar aberto={excluindo !== null} titulo="Excluir local?" rotuloConfirmar="Excluir" perigo onConfirmar={() => void excluir()} onCancelar={() => setExcluindo(null)}>
        <p>{excluindo?.nome} sai do catálogo. Nenhuma viagem usa este local. Não dá para desfazer.</p>
      </Confirmar>

      <Confirmar aberto={emUso !== null} titulo="Local em uso" rotuloConfirmar="Entendi" onConfirmar={() => setEmUso(null)} onCancelar={() => setEmUso(null)}>
        <p>
          {emUso?.local.nome} não pode ser excluído porque está sendo usado. Troque o local nas etapas ou apague as etapas antes.
        </p>
        <ul className="usos-do-local">
          {emUso?.usos.map((u) => <li key={u}>{u}</li>)}
        </ul>
      </Confirmar>
    </>
  )
}

/** A tela do formulário: edita o local `localId` ou cria um novo (`null`). */
export function EditorDeLocal({ repo, localId, onFechar }: { repo: Repositorio; localId: string | null; onFechar: () => void }) {
  const { dados: locais, erro } = useDados(() => repo.listarLocais(), `editor-local:${repo.espaco}`)
  if (erro) {
    return (
      <>
        <Topo titulo="Local" onVoltar={onFechar} />
        <main className="conteudo"><p className="msg-erro">{erro}</p></main>
      </>
    )
  }
  if (!locais) return <Topo titulo="Local" onVoltar={onFechar} />
  const inicial = localId ? locais.find((l) => l.id === localId) : undefined
  if (localId && !inicial) {
    return (
      <>
        <Topo titulo="Local" onVoltar={onFechar} />
        <main className="conteudo"><p className="msg-erro">Local não encontrado.</p></main>
      </>
    )
  }
  return (
    <FormLocal
      key={localId ?? 'novo'}
      inicial={inicial}
      locaisDeReferencia={locais}
      onSalvar={async (local) => {
        await repo.salvarLocal(local)
        onFechar()
      }}
      onCancelar={onFechar}
    />
  )
}
