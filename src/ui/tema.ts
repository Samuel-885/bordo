// Tema da interface: guarda a preferência no aparelho (localStorage, fora do banco e do
// backup) e aplica o tema efetivo no <html>. O horário vem de useAgora (agora()).

import { useEffect, useLayoutEffect, useState } from 'react'
import { COR_DO_NAVEGADOR, ehPreferenciaTema, temaEfetivo, type PreferenciaTema, type Tema } from './logica/tema'
import { useAgora } from './useAgora'

const CHAVE = 'bordo:tema'
const EVENTO = 'bordo:tema-mudou'

export function lerPreferenciaDoTema(): PreferenciaTema {
  try {
    const v = window.localStorage.getItem(CHAVE)
    return ehPreferenciaTema(v) ? v : 'automatico'
  } catch {
    return 'automatico'
  }
}

export function guardarPreferenciaDoTema(p: PreferenciaTema): void {
  try {
    window.localStorage.setItem(CHAVE, p)
  } catch {
    // Sem armazenamento (janela privada): vale só até recarregar.
    memoria = p
  }
  window.dispatchEvent(new Event(EVENTO))
}

let memoria: PreferenciaTema | null = null

function preferenciaAtual(): PreferenciaTema {
  const guardada = lerPreferenciaDoTema()
  return guardada === 'automatico' && memoria ? memoria : guardada
}

/** A preferência e o tema em uso agora; atualiza quando a pessoa muda ou o relógio vira. */
export function useTema(): { preferencia: PreferenciaTema; tema: Tema; definir: (p: PreferenciaTema) => void } {
  const agora = useAgora()
  const [preferencia, setPreferencia] = useState<PreferenciaTema>(preferenciaAtual)
  useEffect(() => {
    const aoMudar = () => setPreferencia(preferenciaAtual())
    window.addEventListener(EVENTO, aoMudar)
    return () => window.removeEventListener(EVENTO, aoMudar)
  }, [])
  return { preferencia, tema: temaEfetivo(preferencia, agora), definir: guardarPreferenciaDoTema }
}

/** Aplica o tema no <html> e na cor da barra do navegador. Não desenha nada. */
export function GerenciadorDeTema() {
  const { tema } = useTema()
  useLayoutEffect(() => {
    document.documentElement.dataset.tema = tema
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COR_DO_NAVEGADOR[tema])
  }, [tema])
  return null
}
