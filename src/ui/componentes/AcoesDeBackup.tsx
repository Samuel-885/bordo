// Gerar o backup e entregá-lo: COMPARTILHAR (menu do celular, quando o navegador aceita o
// arquivo) e BAIXAR ARQUIVO. Mostra sempre o aviso de privacidade. Usado na tela Backup, ao
// iniciar a viagem e na sugestão da tela principal.

import { useState } from 'react'
import { nomeDoArquivoDeBackup, serializarBackup } from '../../core/backup'
import { mensagemDeErroDoBanco } from '../../data/avisoBanco'
import type { Repositorio } from '../../data/repositorio'
import { AVISO_PRIVACIDADE_BACKUP } from '../logica/backup'
import { baixarArquivo, compartilharArquivo, criarArquivoDeBackup, podeCompartilharArquivo } from '../logica/backupArquivo'
import { avisarMudanca } from '../useAgora'

interface Props {
  repo: Repositorio
  /** Depois que o arquivo foi entregue (menu aceito ou download iniciado). */
  aoEntregar?: () => void
}

export function AcoesDeBackup({ repo, aoEntregar }: Props) {
  const [ocupado, setOcupado] = useState(false)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [podeCompartilhar] = useState(() => podeCompartilharArquivo(criarArquivoDeBackup('{}', 'bordo-backup.txt')))

  async function entregar(como: 'compartilhar' | 'baixar') {
    setOcupado(true)
    setErro(null)
    setMensagem(null)
    try {
      const backup = await repo.gerarBackup()
      const arquivo = criarArquivoDeBackup(serializarBackup(backup), nomeDoArquivoDeBackup(backup.geradoEm))
      if (como === 'compartilhar') {
        const r = await compartilharArquivo(arquivo)
        if (r === 'cancelado') {
          setMensagem('Compartilhamento cancelado. Nenhum backup foi registrado.')
          return
        }
        if (r === 'falhou') {
          setErro('Não foi possível abrir o menu de compartilhar. Use BAIXAR ARQUIVO.')
          return
        }
      } else {
        baixarArquivo(arquivo)
      }
      await repo.registrarBackupEntregue(backup)
      setMensagem(
        como === 'compartilhar'
          ? 'Arquivo gerado e entregue ao menu de compartilhar. O app não sabe se o envio terminou; sem internet ele só sai quando houver sinal: confira se chegou.'
          : `Arquivo gerado e baixado (${arquivo.name}). Procure em Downloads e envie para um lugar seguro.`,
      )
      avisarMudanca()
      aoEntregar?.()
    } catch (x) {
      setErro(mensagemDeErroDoBanco(x, 'Não foi possível gerar o backup.'))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="acoes-backup">
      <p className="aviso">{AVISO_PRIVACIDADE_BACKUP}</p>
      <div className="acoes">
        {podeCompartilhar && (
          <button type="button" className="botao principal largo" disabled={ocupado} onClick={() => void entregar('compartilhar')}>
            COMPARTILHAR BACKUP
          </button>
        )}
        <button
          type="button"
          className={`botao largo${podeCompartilhar ? '' : ' principal'}`}
          disabled={ocupado}
          onClick={() => void entregar('baixar')}
        >
          BAIXAR ARQUIVO
        </button>
      </div>
      {mensagem && <p className="dica" role="status">{mensagem}</p>}
      {erro && <p className="msg-erro" role="alert">{erro}</p>}
    </div>
  )
}
