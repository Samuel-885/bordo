// Identificação e equipe da viagem: só alimentam as mensagens (a equipe entra no tamanho do
// grupo do restaurante). Valem planejando e em andamento; a equipe não muda em viagem concluída.

import { useState } from 'react'
import type { Viagem } from '../../core/tipos'
import { Folha } from './Folha'

interface Props {
  viagem: Pick<Viagem, 'identificacao' | 'equipe' | 'status'>
  ocupado: boolean
  erro: string | null
  onSalvar: (dados: { identificacao: string; equipe: number }) => void
  onCancelar: () => void
}

export function FolhaDadosDaViagem({ viagem, ocupado, erro, onSalvar, onCancelar }: Props) {
  const [identificacao, setIdentificacao] = useState(viagem.identificacao ?? '')
  const [equipe, setEquipe] = useState(String(viagem.equipe ?? 0))
  const numero = /^\d{1,2}$/.test(equipe.trim()) ? Number(equipe) : null
  return (
    <Folha
      aberta
      titulo="Identificação e equipe"
      rotuloConfirmar="Salvar"
      ocupado={ocupado}
      erro={erro}
      podeConfirmar={numero !== null}
      onCancelar={onCancelar}
      onConfirmar={() => numero !== null && onSalvar({ identificacao: identificacao.trim(), equipe: numero })}
    >
      <div className="campo">
        <label htmlFor="dados-identificacao">Identificação (aparece nas mensagens)</label>
        <input id="dados-identificacao" value={identificacao} onChange={(e) => setIdentificacao(e.target.value)} autoComplete="off" />
      </div>
      <div className="campo">
        <label htmlFor="dados-equipe">Equipe (motoristas e responsáveis)</label>
        <input
          id="dados-equipe"
          inputMode="numeric"
          value={equipe}
          disabled={viagem.status === 'concluida'}
          onChange={(e) => setEquipe(e.target.value)}
        />
        <p className="dica">Entra no tamanho do grupo da mensagem para o restaurante.</p>
      </div>
    </Folha>
  )
}
