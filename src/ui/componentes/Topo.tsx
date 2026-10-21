interface Props {
  titulo: string
  onVoltar?: () => void
  rotuloVoltar?: string
}

export function Topo({ titulo, onVoltar, rotuloVoltar = 'Voltar' }: Props) {
  return (
    <header className="topo">
      {onVoltar && (
        <button type="button" onClick={onVoltar} aria-label={rotuloVoltar}>
          ‹
        </button>
      )}
      <h1>{titulo}</h1>
    </header>
  )
}
