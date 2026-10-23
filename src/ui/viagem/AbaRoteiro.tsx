// Aba "Roteiro": a visão "Paradas" (lista vertical com as alternativas da próxima parada
// flexível) e a visão "Timeline" (os eventos em ordem, com correção de horário).

import { useState } from 'react'
import { Timeline } from '../Timeline'
import { useAoMudar } from '../useAgora'
import { useDados } from '../useDados'
import type { ContextoDaViagem } from './dados'
import type { Derivados } from './derivados'
import { ListaDeParadas } from './ListaDeParadas'

export type VisaoDoRoteiro = 'paradas' | 'timeline'

interface Props {
  c: ContextoDaViagem
  d: Derivados
  visaoInicial?: VisaoDoRoteiro
  onAlternativas: () => void
}

export function AbaRoteiro({ c, d, visaoInicial = 'paradas', onAlternativas }: Props) {
  const [visao, setVisao] = useState<VisaoDoRoteiro>(visaoInicial)
  const { dados: consultas, recarregar } = useDados(() => c.repo.listarConsultas(c.plano.viagem.id), `consultas:${c.repo.espaco}:${c.plano.viagem.id}`)
  useAoMudar(recarregar)

  return (
    <main className="conteudo viagem">
      <div className="roteiro-topo">
        <div className="segmentos" role="tablist" aria-label="Visão do roteiro">
          {(['paradas', 'timeline'] as const).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={visao === v} className="segmento" onClick={() => setVisao(v)}>
              {v === 'paradas' ? 'Paradas' : 'Timeline'}
            </button>
          ))}
        </div>
        <button type="button" className="botao pequeno" disabled title="Chega na fase 9" aria-describedby="dica-mapa">
          Mapa
        </button>
      </div>
      <p className="dica dica-mapa" id="dica-mapa">Mapa: chega na fase 9.</p>

      {visao === 'paradas' ? (
        <ListaDeParadas c={c} d={d} consultas={consultas ?? []} onAlternativas={onAlternativas} />
      ) : (
        <Timeline repo={c.repo} viagemId={c.plano.viagem.id} incorporada />
      )}
    </main>
  )
}
