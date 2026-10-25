import { useState } from 'react'
import { CONFIG } from '../core/config'
import { agora } from '../core/relogio'
import { naHoraDoDia, ordenarPor } from '../core/tempo'
import type { Viagem } from '../core/tipos'
import { novoId, type Repositorio } from '../data/repositorio'
import { Cabecalho } from './componentes/Cabecalho'
import { dataBr, rotuloDaViagem, STATUS_DA_VIAGEM as STATUS } from './logica/viagens'
import { ExcluirViagem } from './componentes/ExcluirViagem'
import { OpcoesDaViagem } from './componentes/OpcoesDaViagem'
import { useDados } from './useDados'
import { mensagemDeErroDoBanco } from '../data/avisoBanco'

interface Props {
  repo: Repositorio
  demo: boolean
  onAbrir: (viagem: Viagem) => void
  onEntrarNaDemonstracao: () => void
  onModelos: () => void
  onBackup: () => void
  onLocais: () => void
}

export function ListaViagens({ repo, demo, onAbrir, onEntrarNaDemonstracao, onModelos, onBackup, onLocais }: Props) {
  const { dados: viagens, erro, recarregar } = useDados(() => repo.listarViagens(), repo.espaco)
  const [falha, setFalha] = useState<string | null>(null)
  const [opcoes, setOpcoes] = useState<Viagem | null>(null)
  const [excluindo, setExcluindo] = useState<Viagem | null>(null)

  async function nova() {
    const viagem: Viagem = {
      id: novoId(),
      nome: 'Nova viagem',
      tipo: 'ida',
      dataSaida: naHoraDoDia(agora(), '00:00'),
      status: 'planejando',
      fatorOnibus: CONFIG.fatorOnibusPadrao,
      planoOriginal: null,
    }
    try {
      await repo.salvarViagem(viagem)
      onAbrir(viagem)
    } catch (x) {
      setFalha(mensagemDeErroDoBanco(x, 'Não foi possível criar a viagem.'))
    }
  }

  return (
    <>
      <Cabecalho subtitulo={demo ? 'Viagens da demonstração' : 'Suas viagens'} />
      <main className="conteudo">
        {erro && <p className="msg-erro">{erro}</p>}
        {viagens?.length === 0 && <p className="dica">Nenhuma viagem ainda. Toque em “Nova viagem” para começar.</p>}
        {ordenarPor(viagens ?? [], (v) => v.dataSaida)
          .reverse()
          .map((v) => (
            <div key={v.id} className="viagem-linha">
              <button type="button" className="viagem-item" onClick={() => onAbrir(v)}>
                <strong>{v.nome || 'Sem nome'}</strong>
                <span>
                  {v.tipo === 'ida' ? 'Ida' : 'Volta'} · {dataBr(v.dataSaida)} · {STATUS[v.status]}
                </span>
              </button>
              <button type="button" className="viagem-opcoes" aria-label={`Opções de ${v.nome || 'Sem nome'}, ${dataBr(v.dataSaida)}`} onClick={() => setOpcoes(v)}>
                <span aria-hidden="true">⋯</span>
              </button>
            </div>
          ))}
        {falha && <p className="msg-erro">{falha}</p>}
        {opcoes && (
          <OpcoesDaViagem
            rotulo={rotuloDaViagem(opcoes)}
            onFechar={() => setOpcoes(null)}
            onExcluir={() => {
              setExcluindo(opcoes)
              setOpcoes(null)
            }}
          />
        )}
        {excluindo && (
          <ExcluirViagem
            repo={repo}
            viagem={excluindo}
            onCancelar={() => setExcluindo(null)}
            onExcluida={() => {
              setExcluindo(null)
              recarregar()
            }}
          />
        )}
        <button type="button" className="botao principal largo" onClick={nova}>
          Nova viagem
        </button>
        <button type="button" className="botao largo" onClick={onLocais}>
          LOCAIS
        </button>
        <button type="button" className="botao largo" onClick={onModelos}>
          MODELOS DE MENSAGEM
        </button>
        {!demo && (
          <button type="button" className="botao largo" onClick={onBackup}>
            BACKUP
          </button>
        )}
        {!demo && (
          <button type="button" className="botao largo" onClick={onEntrarNaDemonstracao}>
            Abrir a demonstração
          </button>
        )}
      </main>
    </>
  )
}
