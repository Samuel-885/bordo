import { useEffect, useRef } from 'react'

interface Props {
  texto: string
  onDesfazer: () => void
}

/** Aparece logo depois de um registro, por alguns segundos. */
export function AvisoDesfazer({ texto, onDesfazer }: Props) {
  // O aviso é fixo e cobre o fim do conteúdo: publica a altura em --aviso para a tela reservar o espaço.
  const el = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const raiz = document.documentElement
    const publicar = () => raiz.style.setProperty('--aviso', `${(el.current?.offsetHeight ?? 0) + 12}px`)
    publicar()
    const observador = new ResizeObserver(publicar)
    if (el.current) observador.observe(el.current)
    return () => {
      observador.disconnect()
      raiz.style.removeProperty('--aviso')
    }
  }, [])
  return (
    <div className="aviso-desfazer" role="status" ref={el}>
      <span>{texto}</span>
      <button type="button" className="botao pequeno" onClick={onDesfazer}>
        DESFAZER
      </button>
    </div>
  )
}
