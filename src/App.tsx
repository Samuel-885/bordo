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
import { AvisoAtualizacao } from './ui/componentes/AvisoAtualizacao'
import { AvisoBanco } from './ui/componentes/AvisoBanco'
import { FaixaDemo } from './ui/componentes/FaixaDemo'
import { EditorEtapa } from './ui/EditorEtapa'
import { ListaViagens } from './ui/ListaViagens'
import { Passageiros } from './ui/Passageiros'
import { Planejamento } from './ui/Planejamento'
import { TelaViagem } from './ui/TelaViagem'
import { Timeline } from './ui/Timeline'
import { viagemParaAbrirDireto } from './ui/logica/viagemInicial'
import { avisarMudanca } from './ui/useAgora'

type Tela =
  | { nome: 'lista' }
  | { nome: 'planejamento'; viagemId: string }
  | { nome: 'etapa'; viagemId: string; etapaId: string | null }
  | { nome: 'viagem'; viagemId: string }
  | { nome: 'timeline'; viagemId: string }
  | { nome: 'passageiros'; viagemId: string }

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

  useEffect(() => {
    void pedirArmazenamentoPersistente()
    window.history.replaceState({ tela: LISTA, indice: 0 } satisfies EstadoHistorico, '')
    const aoVoltar = (e: PopStateEvent) => {
      const estado = e.state as EstadoHistorico | null
      if (estado?.tela) {
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
      setFalha(x instanceof Error ? x.message : 'Não foi possível abrir a demonstração.')
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
        <ListaViagens key={`lista-${versao}`} repo={repo} demo={demo} onAbrir={abrirViagem} onEntrarNaDemonstracao={abrirDemonstracao} />
      )}
      {tela.nome === 'planejamento' && (
        <Planejamento
          key={`plan-${tela.viagemId}-${versao}`}
          repo={repo}
          viagemId={tela.viagemId}
          onVoltar={() => voltar(LISTA)}
          onEditarEtapa={(etapaId) => irPara({ nome: 'etapa', viagemId: tela.viagemId, etapaId })}
          onPassageiros={() => irPara({ nome: 'passageiros', viagemId: tela.viagemId })}
          onViagemExcluida={() => irPara(LISTA, true)}
          onAbrirViagem={() => irPara({ nome: 'viagem', viagemId: tela.viagemId }, true)}
        />
      )}
      {tela.nome === 'etapa' && (
        <EditorEtapa
          key={`etapa-${tela.etapaId ?? 'nova'}-${versao}`}
          repo={repo}
          viagemId={tela.viagemId}
          etapaId={tela.etapaId}
          onFechar={() => voltar({ nome: 'planejamento', viagemId: tela.viagemId })}
        />
      )}
      {tela.nome === 'viagem' && (
        <TelaViagem
          key={`viagem-${tela.viagemId}-${versao}`}
          repo={repo}
          viagemId={tela.viagemId}
          onVoltar={() => voltar(LISTA)}
          onTimeline={() => irPara({ nome: 'timeline', viagemId: tela.viagemId })}
          onPassageiros={() => irPara({ nome: 'passageiros', viagemId: tela.viagemId })}
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
      {tela.nome === 'passageiros' && (
        <Passageiros
          key={`passageiros-${tela.viagemId}-${versao}`}
          repo={repo}
          viagemId={tela.viagemId}
          onVoltar={() => voltar({ nome: 'viagem', viagemId: tela.viagemId })}
        />
      )}
      {tela.nome === 'timeline' && (
        <Timeline
          key={`timeline-${tela.viagemId}-${versao}`}
          repo={repo}
          viagemId={tela.viagemId}
          onVoltar={() => voltar({ nome: 'viagem', viagemId: tela.viagemId })}
        />
      )}
    </>
  )
}

export default App
