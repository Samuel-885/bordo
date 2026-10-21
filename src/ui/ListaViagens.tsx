import { useState } from 'react'
import { CONFIG } from '../core/config'
import { agora } from '../core/relogio'
import { naHoraDoDia, ordenarPor } from '../core/tempo'
import type { Viagem } from '../core/tipos'
import { novoId, type Repositorio } from '../data/repositorio'
import { Topo } from './componentes/Topo'
import { formatarData } from './logica/horarios'
import { useDados } from './useDados'

interface Props {
  repo: Repositorio
  demo: boolean
  onAbrir: (viagem: Viagem) => void
  onEntrarNaDemonstracao: () => void
}

const STATUS = { planejando: 'Planejando', em_andamento: 'Em andamento', concluida: 'Concluída' } as const

function dataBr(i: Viagem['dataSaida']): string {
  const [a, m, d] = formatarData(i).split('-')
  return `${d}/${m}/${a}`
}

export function ListaViagens({ repo, demo, onAbrir, onEntrarNaDemonstracao }: Props) {
  const { dados: viagens, erro } = useDados(() => repo.listarViagens(), repo.espaco)
  const [falha, setFalha] = useState<string | null>(null)

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
      setFalha(x instanceof Error ? x.message : 'Não foi possível criar a viagem.')
    }
  }

  return (
    <>
      <Topo titulo={demo ? 'Viagens da demonstração' : 'Bordo'} />
      <main className="conteudo">
        {erro && <p className="msg-erro">{erro}</p>}
        {viagens?.length === 0 && <p className="dica">Nenhuma viagem ainda. Toque em “Nova viagem” para começar.</p>}
        {ordenarPor(viagens ?? [], (v) => v.dataSaida)
          .reverse()
          .map((v) => (
            <button key={v.id} type="button" className="viagem-item" onClick={() => onAbrir(v)}>
              <strong>{v.nome || 'Sem nome'}</strong>
              <span>
                {v.tipo === 'ida' ? 'Ida' : 'Volta'} · {dataBr(v.dataSaida)} · {STATUS[v.status]}
              </span>
            </button>
          ))}
        {falha && <p className="msg-erro">{falha}</p>}
        <button type="button" className="botao principal largo" onClick={nova}>
          Nova viagem
        </button>
        {!demo && (
          <button type="button" className="botao largo" onClick={onEntrarNaDemonstracao}>
            Abrir a demonstração
          </button>
        )}
      </main>
    </>
  )
}
