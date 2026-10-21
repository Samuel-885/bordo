import { useEffect, useRef, type FormEvent, type ReactNode } from 'react'

interface Props {
  aberta: boolean
  titulo: string
  children: ReactNode
  rotuloConfirmar: string
  ocupado?: boolean
  podeConfirmar?: boolean
  erro?: string | null
  onConfirmar: () => void
  onCancelar: () => void
}

/** Painel na parte de baixo da tela, para formulários curtos da tela principal. */
export function Folha({ aberta, titulo, children, rotuloConfirmar, ocupado, podeConfirmar = true, erro, onConfirmar, onCancelar }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (aberta && !d.open) d.showModal()
    if (!aberta && d.open) d.close()
  }, [aberta])

  function enviar(e: FormEvent) {
    e.preventDefault()
    if (podeConfirmar && !ocupado) onConfirmar()
  }

  return (
    <dialog ref={ref} className="folha" onCancel={(e) => { e.preventDefault(); onCancelar() }}>
      <form onSubmit={enviar}>
        <h2>{titulo}</h2>
        {aberta && children}
        {erro && <p className="msg-erro" role="alert">{erro}</p>}
        <div className="acoes">
          <button type="submit" className="botao principal" disabled={!podeConfirmar || ocupado}>
            {rotuloConfirmar}
          </button>
          <button type="button" className="botao" onClick={onCancelar}>
            Cancelar
          </button>
        </div>
      </form>
    </dialog>
  )
}
