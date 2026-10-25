import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  aberto: boolean
  titulo: string
  children: ReactNode
  rotuloConfirmar: string
  perigo?: boolean
  /** Deixa o botão de confirmar desligado (por exemplo, até marcar "entendo"). */
  desligarConfirmar?: boolean
  onConfirmar: () => void
  onCancelar: () => void
}

/** Pede confirmação antes de uma ação difícil de desfazer. */
export function Confirmar({ aberto, titulo, children, rotuloConfirmar, perigo, desligarConfirmar, onConfirmar, onCancelar }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (aberto && !d.open) d.showModal()
    if (!aberto && d.open) d.close()
  }, [aberto])

  return (
    <dialog ref={ref} className="confirmar" onCancel={(e) => { e.preventDefault(); onCancelar() }}>
      <h2>{titulo}</h2>
      <div>{children}</div>
      <div className="acoes">
        <button type="button" className="botao" onClick={onCancelar}>
          Voltar
        </button>
        <button type="button" className={`botao ${perigo ? 'perigo' : 'principal'}`} disabled={desligarConfirmar} onClick={onConfirmar}>
          {rotuloConfirmar}
        </button>
      </div>
    </dialog>
  )
}
