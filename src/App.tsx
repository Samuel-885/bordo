// Raiz do app: escolhe o espaço de dados (real ou demonstração), que decide o banco
// e o relógio, e navega entre as telas de planejamento.

import { useEffect, useState } from 'react'
import { entrarNaDemonstracao, entrarNoEspacoReal, sairDaDemonstracao } from './data/espaco'
import { pedirArmazenamentoPersistente } from './data/persistencia'
import type { Repositorio } from './data/repositorio'
import { FaixaDemo } from './ui/componentes/FaixaDemo'
import { EditorEtapa } from './ui/EditorEtapa'
import { ListaViagens } from './ui/ListaViagens'
import { Planejamento } from './ui/Planejamento'

type Tela =
  | { nome: 'lista' }
  | { nome: 'planejamento'; viagemId: string }
  | { nome: 'etapa'; viagemId: string; etapaId: string | null }

const VIAGEM_DEMO = 'demo-viagem'

function App() {
  // O relógio real é ligado antes de abrir o banco real.
  const [repo, setRepo] = useState<Repositorio>(() => entrarNoEspacoReal())
  const [tela, setTela] = useState<Tela>({ nome: 'lista' })
  const [versao, setVersao] = useState(0)
  const [falha, setFalha] = useState<string | null>(null)

  useEffect(() => {
    void pedirArmazenamentoPersistente()
  }, [])

  const demo = repo.espaco === 'demo'

  async function abrirDemonstracao() {
    try {
      const demoRepo = await entrarNaDemonstracao()
      setRepo(demoRepo)
      setTela({ nome: 'planejamento', viagemId: VIAGEM_DEMO })
      setVersao((v) => v + 1)
      setFalha(null)
    } catch (x) {
      // Se algo falhou no meio, o relógio volta para o do espaço real.
      setRepo(entrarNoEspacoReal())
      setFalha(x instanceof Error ? x.message : 'Não foi possível abrir a demonstração.')
    }
  }

  function sairDaDemo() {
    sairDaDemonstracao()
    setRepo(entrarNoEspacoReal())
    setTela({ nome: 'lista' })
    setVersao((v) => v + 1)
  }

  return (
    <>
      <FaixaDemo onReiniciar={abrirDemonstracao} onSair={sairDaDemo} />
      {falha && <p className="msg-erro" style={{ padding: '0 12px' }}>{falha}</p>}
      {tela.nome === 'lista' && (
        <ListaViagens
          key={`lista-${versao}`}
          repo={repo}
          demo={demo}
          onAbrir={(viagemId) => setTela({ nome: 'planejamento', viagemId })}
          onEntrarNaDemonstracao={abrirDemonstracao}
        />
      )}
      {tela.nome === 'planejamento' && (
        <Planejamento
          key={`plan-${tela.viagemId}-${versao}`}
          repo={repo}
          viagemId={tela.viagemId}
          onVoltar={() => setTela({ nome: 'lista' })}
          onEditarEtapa={(etapaId) => setTela({ nome: 'etapa', viagemId: tela.viagemId, etapaId })}
          onViagemExcluida={() => setTela({ nome: 'lista' })}
        />
      )}
      {tela.nome === 'etapa' && (
        <EditorEtapa
          key={`etapa-${tela.etapaId ?? 'nova'}-${versao}`}
          repo={repo}
          viagemId={tela.viagemId}
          etapaId={tela.etapaId}
          onFechar={() => setTela({ nome: 'planejamento', viagemId: tela.viagemId })}
        />
      )}
    </>
  )
}

export default App
