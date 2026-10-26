// Preferência "Usar trânsito (TomTom)": fica no aparelho (localStorage, fora do banco e do backup),
// como o modo noite. Ligada por padrão. Desligada, nada chama a função de trânsito: o botão, o modo
// automático e a inclusão de parada usam só o OSRM, como na versão anterior.

import { useEffect, useState } from 'react'

const CHAVE = 'bordo:usar-transito'
const EVENTO = 'bordo:usar-transito-mudou'

/** Só vale até recarregar, quando o aparelho não deixa guardar (janela privada). */
let memoria: boolean | null = null

/** Ligada, salvo se a pessoa desligou. Lida na hora de cada cálculo. */
export function lerUsarTransito(): boolean {
  try {
    const v = window.localStorage.getItem(CHAVE)
    return v === null ? (memoria ?? true) : v !== 'desligado'
  } catch {
    return memoria ?? true
  }
}

export function definirUsarTransito(ligado: boolean): void {
  try {
    if (ligado) window.localStorage.removeItem(CHAVE)
    else window.localStorage.setItem(CHAVE, 'desligado')
  } catch {
    memoria = ligado
  }
  window.dispatchEvent(new Event(EVENTO))
}

export function useUsarTransito(): [boolean, (ligado: boolean) => void] {
  const [ligado, setLigado] = useState(lerUsarTransito)
  useEffect(() => {
    const aoMudar = () => setLigado(lerUsarTransito())
    window.addEventListener(EVENTO, aoMudar)
    return () => window.removeEventListener(EVENTO, aoMudar)
  }, [])
  return [ligado, definirUsarTransito]
}
