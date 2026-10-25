// Folha de opções de uma viagem da lista. Só tem "Excluir viagem", separado do toque que abre
// a viagem, para a exclusão nunca acontecer por um toque acidental na linha.

import { useEffect, useRef } from 'react'

interface Props {
  /** "Teste · 14/11/2026 · Concluída". */
  rotulo: string
  onExcluir: () => void
  onFechar: () => void
}

export function OpcoesDaViagem({ rotulo, onExcluir, onFechar }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
  }, [])
  return (
    <dialog ref={ref} className="folha" aria-label="Opções da viagem" onCancel={(e) => { e.preventDefault(); onFechar() }}>
      <h2>{rotulo}</h2>
      <div className="acoes">
        <button type="button" className="botao perigo largo" onClick={onExcluir}>
          Excluir viagem
        </button>
        <button type="button" className="botao largo" onClick={onFechar}>
          Cancelar
        </button>
      </div>
    </dialog>
  )
}
