// Raiz do app: escolhe o espaço de dados (real ou demonstração), que decide o banco
// e o relógio, e navega entre as telas. As telas acompanham o histórico do navegador
// (history.pushState), para o botão voltar do celular navegar entre elas.

import { useCallback, useEffect, useRef, useState } from 'react'
import { entrarNaDemonstracao, entrarNoEspacoReal, sairDaDemonstracao } from './data/espaco'
import { pedirArmazenamentoPersistente } from './data/persistencia'
import type { Repositorio } from './data/repositorio'
import type { Viagem } from './core/tipos'
import type { Cenario } from './demo/cenarios'
import { VIAGEM_DEMO_ID } from './demo/dados'
import { ExecutorNoBanco } from './demo/executorNoBanco'
import type { Aba } from './ui/componentes/BarraDeAbas'
import { AvisoAtualizacao } from './ui/componentes/AvisoAtualizacao'
import { AvisoBanco } from './ui/componentes/AvisoBanco'
import { FaixaDemo } from './ui/componentes/FaixaDemo'
import { EditorEtapa } from './ui/EditorEtapa'
import { ListaViagens } from './ui/ListaViagens'
import { Alternativas } from './ui/Alternativas'
import { Backup } from './ui/Backup'
import { EditorDeLocal, Locais } from './ui/Locais'
import { Modelos } from './ui/Modelos'
import { Planejamento } from './ui/Planejamento'
import { ViagemShell } from './ui/viagem/ViagemShell'
import { viagemParaAbrirDireto } from './ui/logica/viagemInicial'
import { GerenciadorDeTema } from './ui/tema'
import { avisarMudanca } from './ui/useAgora'
import { mensagemDeErroDoBanco } from './data/avisoBanco'

type Tela =
  | { nome: 'lista' }
  | { nome: 'planejamento'; viagemId: string; aba?: Aba }
  | { nome: 'etapa'; viagemId: string; etapaId: string | null }
  | { nome: 'viagem'; viagemId: string; aba?: Aba; visao?: 'paradas' | 'timeline' }
  | { nome: 'alternativas'; viagemId: string }
  | { nome: 'backup' }
  | { nome: 'locais' }
  /** O formulário de um local do catálogo; vazio = novo. */
  | { nome: 'local'; localId: string | null }
  /** `viagemId` é a viagem da prévia ao vivo; vazio = a em andamento mais recente. */
  | { nome: 'modelos'; viagemId: string | null }

interface EstadoHistorico {
  tela: Tela
  indice: number
}

const LISTA: Tela = { nome: 'lista' }

function App() {
  // O relógio real é ligado antes de abrir o banco real.
  const [repo, setRepo] = useState<Repositorio>(() => entrarNoEspacoReal())
  const [tela, setTela] = useState<Tela>(LISTA)
  const [versao, setVersao] = useState(0)
  const [falha, setFalha] = useState<string | null>(null)
  const [executor, setExecutor] = useState<ExecutorNoBanco | null>(null)
  /** Posição da tela atual na pilha do histórico (0 = primeira). */
  const indice = useRef(0)
  /** A navegação em curso é "ir para a lista": a entrada 0 vira a lista, seja qual for o seu conteúdo. */
  const paraLista = useRef(false)

  const irPara = useCallback((nova: Tela, substituir = false) => {
    if (substituir) {
      window.history.replaceState({ tela: nova, indice: indice.current } satisfies EstadoHistorico, '')
    } else {
      indice.current += 1
      window.history.pushState({ tela: nova, indice: indice.current } satisfies EstadoHistorico, '')
    }
    setTela(nova)
  }, [])

  /** Voltar do app = voltar do navegador; sem histórico para voltar, vai para `padrao`. */
  const voltar = useCallback(
    (padrao: Tela) => {
      if (indice.current > 0) window.history.back()
      else irPara(padrao, true)
    },
    [irPara],
  )

  /** Volta à lista pulando as abas empilhadas no histórico (voltar uma entrada só trocaria de aba). */
  const irParaLista = useCallback(() => {
    if (indice.current > 0) {
      paraLista.current = true
      window.history.go(-indice.current)
    } else irPara(LISTA, true)
  }, [irPara])

  useEffect(() => {
    void pedirArmazenamentoPersistente()
    window.history.replaceState({ tela: LISTA, indice: 0 } satisfies EstadoHistorico, '')
    const aoVoltar = (e: PopStateEvent) => {
      const estado = e.state as EstadoHistorico | null
      if (paraLista.current) {
        paraLista.current = false
        indice.current = 0
        window.history.replaceState({ tela: LISTA, indice: 0 } satisfies EstadoHistorico, '')
        setTela(LISTA)
      } else if (estado?.tela) {
        indice.current = estado.indice
        setTela(estado.tela)
      } else {
        indice.current = 0
        window.history.replaceState({ tela: LISTA, indice: 0 } satisfies EstadoHistorico, '')
        setTela(LISTA)
      }
    }
    window.addEventListener('popstate', aoVoltar)
    return () => window.removeEventListener('popstate', aoVoltar)
  }, [])

  // Ao abrir no espaço real, uma única viagem em andamento abre direto; a lista fica no voltar.
  const jaDecidiuAbertura = useRef(false)
  useEffect(() => {
    if (jaDecidiuAbertura.current) return
    jaDecidiuAbertura.current = true
    const repoInicial = repo
    void repoInicial.listarViagens().then((viagens) => {
      const v = viagemParaAbrirDireto(viagens)
      // Se a pessoa já navegou (ou entrou na demonstração) enquanto lia o banco, não mexe.
      if (v && indice.current === 0 && repoInicial.espaco === 'real') irPara({ nome: 'viagem', viagemId: v.id })
    })
  }, [repo, irPara])

  const demo = repo.espaco === 'demo'

  async function abrirDemonstracao() {
    try {
      const demoRepo = await entrarNaDemonstracao()
      setRepo(demoRepo)
      setExecutor(null)
      irPara({ nome: 'planejamento', viagemId: VIAGEM_DEMO_ID }, tela.nome === 'planejamento')
      setVersao((v) => v + 1)
      setFalha(null)
    } catch (x) {
      // Se algo falhou no meio, o relógio volta para o do espaço real.
      setRepo(entrarNoEspacoReal())
      setExecutor(null)
      setFalha(mensagemDeErroDoBanco(x, 'Não foi possível abrir a demonstração.'))
    }
  }

  function sairDaDemo() {
    sairDaDemonstracao()
    setRepo(entrarNoEspacoReal())
    setExecutor(null)
    irPara(LISTA, true)
    setVersao((v) => v + 1)
  }

  async function escolherCenario(cenario: Cenario) {
    const novo = await ExecutorNoBanco.iniciar(repo, cenario)
    setExecutor(novo)
    setVersao((v) => v + 1)
    irPara({ nome: 'viagem', viagemId: VIAGEM_DEMO_ID }, tela.nome === 'viagem')
  }

  function abrirViagem(v: Viagem) {
    irPara(v.status === 'planejando' ? { nome: 'planejamento', viagemId: v.id } : { nome: 'viagem', viagemId: v.id })
  }

  return (
    <>
      <GerenciadorDeTema />
      <FaixaDemo
        executor={executor}
        onReiniciar={abrirDemonstracao}
        onSair={sairDaDemo}
        onEscolherCenario={escolherCenario}
      />
      <AvisoAtualizacao />
      <AvisoBanco />
      {falha && <p className="msg-erro" style={{ padding: '0 12px' }}>{falha}</p>}
      {tela.nome === 'lista' && (
        <ListaViagens
          key={`lista-${versao}`}
          repo={repo}
          demo={demo}
          onAbrir={abrirViagem}
          onEntrarNaDemonstracao={abrirDemonstracao}
          onModelos={() => irPara({ nome: 'modelos', viagemId: null })}
          onBackup={() => irPara({ nome: 'backup' })}
          onLocais={() => irPara({ nome: 'locais' })}
        />
      )}
      {tela.nome === 'planejamento' && (
        <Planejamento
          key={`plan-${tela.viagemId}-${versao}`}
          repo={repo}
          viagemId={tela.viagemId}
          onVoltar={irParaLista}
          onEditarEtapa={(etapaId) => irPara({ nome: 'etapa', viagemId: tela.viagemId, etapaId })}
          onViagemExcluida={irParaLista}
          onAbrirViagem={() => irPara({ nome: 'viagem', viagemId: tela.viagemId }, true)}
          aba={tela.aba ?? 'viagem'}
          onAba={(aba) => irPara({ nome: 'planejamento', viagemId: tela.viagemId, aba })}
          onModelos={() => irPara({ nome: 'modelos', viagemId: tela.viagemId })}
          onBackup={() => irPara({ nome: 'backup' })}
          onEditarLocal={(localId) => irPara({ nome: 'local', localId })}
          onAbrirDemo={abrirDemonstracao}
          onSairDaDemo={sairDaDemo}
        />
      )}
      {tela.nome === 'etapa' && (
        <EditorEtapa
          key={`etapa-${tela.etapaId ?? 'nova'}-${versao}`}
          repo={repo}
          viagemId={tela.viagemId}
          etapaId={tela.etapaId}
          onFechar={() => voltar({ nome: 'planejamento', viagemId: tela.viagemId, aba: 'roteiro' })}
        />
      )}
      {tela.nome === 'viagem' && (
        <ViagemShell
          key={`viagem-${tela.viagemId}-${versao}`}
          repo={repo}
          viagemId={tela.viagemId}
          onVoltar={irParaLista}
          aba={tela.aba ?? 'viagem'}
          visao={tela.visao}
          onAba={(aba, visao) => irPara({ nome: 'viagem', viagemId: tela.viagemId, aba, ...(visao ? { visao } : {}) })}
          onAlternativas={() => irPara({ nome: 'alternativas', viagemId: tela.viagemId })}
          onModelos={() => irPara({ nome: 'modelos', viagemId: tela.viagemId })}
          onBackup={() => irPara({ nome: 'backup' })}
          onEditarLocal={(localId) => irPara({ nome: 'local', localId })}
          onAbrirDemo={abrirDemonstracao}
          onSairDaDemo={sairDaDemo}
          aoRegistrar={
            executor
              ? () => {
                  executor.entrarNoModoLivre()
                  avisarMudanca()
                }
              : undefined
          }
        />
      )}
      {tela.nome === 'alternativas' && (
        <Alternativas
          key={`alternativas-${tela.viagemId}-${versao}`}
          repo={repo}
          viagemId={tela.viagemId}
          onVoltar={() => voltar({ nome: 'viagem', viagemId: tela.viagemId, aba: 'roteiro' })}
          onModelos={() => irPara({ nome: 'modelos', viagemId: tela.viagemId })}
          aoRegistrar={
            executor
              ? () => {
                  executor.entrarNoModoLivre()
                  avisarMudanca()
                }
              : undefined
          }
        />
      )}
      {tela.nome === 'modelos' && (
        <Modelos
          key={`modelos-${versao}`}
          repo={repo}
          viagemId={tela.viagemId}
          onVoltar={() => voltar(LISTA)}
        />
      )}
      {tela.nome === 'locais' && (
        <Locais key={`locais-${repo.espaco}-${versao}`} repo={repo} onEditar={(localId) => irPara({ nome: 'local', localId })} onVoltar={() => voltar(LISTA)} />
      )}
      {tela.nome === 'local' && (
        <EditorDeLocal key={`local-${tela.localId ?? 'novo'}-${versao}`} repo={repo} localId={tela.localId} onFechar={() => voltar(LISTA)} />
      )}
      {tela.nome === 'backup' && !demo && (
        <Backup key={`backup-${versao}`} repo={repo} onVoltar={() => voltar(LISTA)} onAbrirViagem={abrirViagem} />
      )}
    </>
  )
}

export default App
