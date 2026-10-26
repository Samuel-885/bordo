// Preferência "Atualizar sozinho a cada 5 minutos": fica no aparelho (localStorage, fora do banco e
// do backup), como o modo noite. Guarda o id da viagem em que foi ligada: o modo só vale para ela.
// Desligada por padrão; ligar é a autorização.

import { useEffect, useState } from 'react'

const CHAVE = 'bordo:atualizar-sozinho'
const EVENTO = 'bordo:atualizar-sozinho-mudou'

/** Só vale até recarregar, quando o aparelho não deixa guardar (janela privada). */
let memoria: string | null = null

/** O id da viagem em que o modo está ligado; vazio se está desligado. */
export function lerViagemDoAtualizarSozinho(): string | null {
  try {
    return window.localStorage.getItem(CHAVE) || null
  } catch {
    return memoria
  }
}

function guardar(viagemId: string | null): void {
  try {
    if (viagemId) window.localStorage.setItem(CHAVE, viagemId)
    else window.localStorage.removeItem(CHAVE)
  } catch {
    memoria = viagemId
  }
  window.dispatchEvent(new Event(EVENTO))
}

/**
 * Ligar numa viagem passa a preferência para ela (a de outra deixa de valer). Desligar só mexe se
 * a preferência é desta viagem: abrir outra viagem e mexer ali não desliga a que está em andamento.
 */
export function definirAtualizarSozinho(viagemId: string, ligado: boolean): void {
  if (ligado) guardar(viagemId)
  else if (lerViagemDoAtualizarSozinho() === viagemId) guardar(null)
}

/** `ligado` é verdadeiro só na viagem em que o modo foi ligado. */
export function useAtualizarSozinho(viagemId: string): [boolean, (ligado: boolean) => void] {
  const [guardada, setGuardada] = useState(lerViagemDoAtualizarSozinho)
  useEffect(() => {
    const aoMudar = () => setGuardada(lerViagemDoAtualizarSozinho())
    window.addEventListener(EVENTO, aoMudar)
    return () => window.removeEventListener(EVENTO, aoMudar)
  }, [])
  return [guardada === viagemId, (ligado) => definirAtualizarSozinho(viagemId, ligado)]
}
