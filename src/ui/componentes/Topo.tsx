import type { ReactNode } from 'react'

interface Props {
  titulo: string
  onVoltar?: () => void
  rotuloVoltar?: string
  direita?: ReactNode
}

export function Topo({ titulo, onVoltar, rotuloVoltar = 'Voltar', direita }: Props) {
  return (
    <header className="topo">
      {onVoltar && (
        <button type="button" onClick={onVoltar} aria-label={rotuloVoltar}>
          ‹
        </button>
      )}
      <h1>{titulo}</h1>
      {direita}
    </header>
  )
}
