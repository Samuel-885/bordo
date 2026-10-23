import type { ReactNode } from 'react'
import { useOnline } from '../useOnline'

/** "bordo." com o ponto na cor de destaque. */
export function MarcaBordo() {
  return (
    <span className="marca" aria-label="bordo">
      bordo<span className="marca-ponto" aria-hidden="true">.</span>
    </span>
  )
}

/** "Online" (verde) ou "Sem internet" (âmbar), pelo navigator.onLine. */
export function SeloDeRede() {
  const online = useOnline()
  return (
    <span className={`selo-rede ${online ? 'online' : 'offline'}`} role="status" data-teste="selo-rede">
      {online ? 'Online' : 'Sem internet'}
    </span>
  )
}

interface Props {
  /** Segunda linha: nome da viagem e tipo. */
  subtitulo?: string
  direita?: ReactNode
}

/** Topo das telas da viagem: marca, nome e tipo da viagem e o selo de rede. */
export function Cabecalho({ subtitulo, direita }: Props) {
  return (
    <header className="cabecalho">
      <div className="cabecalho-texto">
        <MarcaBordo />
        {subtitulo && <p className="cabecalho-viagem">{subtitulo}</p>}
      </div>
      {direita ?? <SeloDeRede />}
    </header>
  )
}
