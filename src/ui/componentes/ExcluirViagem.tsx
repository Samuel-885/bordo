// Excluir uma viagem em qualquer status. Em planejamento, a confirmação de sempre; iniciada ou
// concluída, mostra nome, data e status, sugere o backup e só liga o botão depois de marcar
// "Entendo que os registros serão apagados". A exclusão em si é do repositório.

import { useState } from 'react'
import type { Viagem } from '../../core/tipos'
import { mensagemDeErroDoBanco } from '../../data/avisoBanco'
import type { Repositorio } from '../../data/repositorio'
import { exigeConfirmacaoForte, STATUS_DA_VIAGEM, dataBr } from '../logica/viagens'
import { AcoesDeBackup } from './AcoesDeBackup'
import { Confirmar } from './Confirmar'

interface Props {
  repo: Repositorio
  viagem: Pick<Viagem, 'id' | 'nome' | 'dataSaida' | 'status'>
  /** Depois de apagar. */
  onExcluida: () => void
  onCancelar: () => void
}

/** Monte só enquanto a pergunta estiver aberta: cada abertura começa sem a caixa marcada. */
export function ExcluirViagem({ repo, viagem, onExcluida, onCancelar }: Props) {
  const forte = exigeConfirmacaoForte(viagem)
  const [entendi, setEntendi] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function excluir() {
    if (ocupado || (forte && !entendi)) return
    setOcupado(true)
    setErro(null)
    try {
      await repo.excluirViagem(viagem.id)
      onExcluida()
    } catch (x) {
      setErro(mensagemDeErroDoBanco(x, 'Não foi possível excluir a viagem.'))
      setOcupado(false)
    }
  }

  return (
    <Confirmar
      aberto
      titulo="Excluir a viagem?"
      perigo
      rotuloConfirmar={ocupado ? 'Excluindo…' : 'Excluir viagem'}
      desligarConfirmar={ocupado || (forte && !entendi)}
      onCancelar={onCancelar}
      onConfirmar={() => void excluir()}
    >
      <p>
        <strong>{viagem.nome || 'Sem nome'}</strong>
        <br />
        {dataBr(viagem.dataSaida)} · {STATUS_DA_VIAGEM[viagem.status]}
      </p>
      <p>
        {forte
          ? 'Apaga a viagem com as etapas, os tempos, os registros, os passageiros e as consultas ao Google Maps. Não dá para desfazer. Os locais do catálogo ficam.'
          : 'A viagem será apagada com todas as etapas e tempos. Os locais do catálogo ficam.'}
      </p>
      {forte && (
        <>
          {repo.espaco === 'real' && (
            <>
              <p className="dica">Se quiser guardar esta viagem, faça o backup antes.</p>
              <AcoesDeBackup repo={repo} />
            </>
          )}
          <label className="opcao">
            <input type="checkbox" checked={entendi} onChange={(e) => setEntendi(e.target.checked)} />
            <span>Entendo que os registros serão apagados.</span>
          </label>
        </>
      )}
      {erro && <p className="msg-erro" role="alert">{erro}</p>}
    </Confirmar>
  )
}

