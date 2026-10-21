interface Props {
  texto: string
  onDesfazer: () => void
}

/** Aparece logo depois de um registro, por alguns segundos. */
export function AvisoDesfazer({ texto, onDesfazer }: Props) {
  return (
    <div className="aviso-desfazer" role="status">
      <span>{texto}</span>
      <button type="button" className="botao pequeno" onClick={onDesfazer}>
        DESFAZER
      </button>
    </div>
  )
}
