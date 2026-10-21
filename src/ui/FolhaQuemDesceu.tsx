// "Quem desceu?": marcação opcional de quem saiu do ônibus na parada. Só coleta; a
// validação (quem está a bordo naquele ponto) vem do núcleo, via repositório.

import { useEffect, useRef, useState } from 'react'
import type { Passageiro } from '../core/tipos'

interface Props {
  /** Só os esperados a bordo naquele ponto. */
  aBordo: readonly Passageiro[]
  /** A marcação em vigor, para corrigir. Vazio = ainda ninguém marcou. */
  atual: readonly string[] | null
  /** Abriu sozinha (CHEGAMOS ou PARAMOS): o botão de sair é "Agora não". */
  automatica: boolean
  ocupado: boolean
  erro: string | null
  onSalvar: (passageiroIds: string[]) => void
  onFechar: () => void
}

export function FolhaQuemDesceu({ aBordo, atual, automatica, ocupado, erro, onSalvar, onFechar }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const [escolhendo, setEscolhendo] = useState(atual !== null)
  const [marcados, setMarcados] = useState<string[]>(() => (atual ?? []).filter((id) => aBordo.some((p) => p.id === id)))
  const ordenados = [...aBordo].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
  }, [])

  const alternar = (id: string) => setMarcados((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]))

  return (
    <dialog ref={ref} className="folha" onCancel={(e) => { e.preventDefault(); onFechar() }}>
      <h2>Quem desceu?</h2>
      <p className="dica">Opcional. Ajuda a conferir na saída. Não muda a previsão.</p>
      {escolhendo && (
        <ul className="lista-conferencia" aria-label="Passageiros a bordo">
          {ordenados.map((p) => {
            const desceu = marcados.includes(p.id)
            return (
              <li key={p.id}>
                <button type="button" className={`passageiro-item ${desceu ? 'desceu' : 'confirmado'}`} aria-pressed={desceu} onClick={() => alternar(p.id)}>
                  <span aria-hidden="true">{desceu ? '✓' : '○'}</span>
                  <span>{p.nome}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {erro && <p className="msg-erro" role="alert">{erro}</p>}
      <div className="acoes colunas">
        {escolhendo ? (
          <button type="button" className="botao principal" disabled={ocupado} onClick={() => onSalvar(marcados)}>
            Salvar ({marcados.length} {marcados.length === 1 ? 'desceu' : 'desceram'})
          </button>
        ) : (
          <button type="button" className="botao" disabled={ocupado} onClick={() => setEscolhendo(true)}>
            Escolher nomes
          </button>
        )}
        <button type="button" className="botao" disabled={ocupado} onClick={() => onSalvar(aBordo.map((p) => p.id))}>
          Todos
        </button>
        <button type="button" className="botao" disabled={ocupado} onClick={onFechar}>
          {automatica ? 'Agora não' : 'Cancelar'}
        </button>
      </div>
    </dialog>
  )
}
