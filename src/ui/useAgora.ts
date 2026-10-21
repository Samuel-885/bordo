// Horário atual para as telas. Sempre lido por agora(); o hook só pede para a tela
// desenhar de novo: na virada de cada minuto, ao voltar do segundo plano e quando a
// demonstração mexe no relógio ou nos dados.

import { useEffect, useState } from 'react'
import { agora } from '../core/relogio'
import type { Instante } from '../core/tipos'

const EVENTO = 'bordo:mudou'

/** A demonstração avisa as telas: o relógio ou os dados mudaram. */
export function avisarMudanca(): void {
  window.dispatchEvent(new Event(EVENTO))
}

/** Roda `acao` quando a demonstração avisa de mudança. */
export function useAoMudar(acao: () => void): void {
  useEffect(() => {
    window.addEventListener(EVENTO, acao)
    return () => window.removeEventListener(EVENTO, acao)
  }, [acao])
}

export function useAgora(): Instante {
  const [, desenhar] = useState(0)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const atualizar = () => desenhar((n) => n + 1)
    const armar = () => {
      // Segundos do horário atual → quanto falta para o próximo minuto (+100 ms de folga).
      const segundos = Number(agora().slice(17, 19))
      timer = setTimeout(() => {
        atualizar()
        armar()
      }, (60 - segundos) * 1000 + 100)
    }
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') {
        atualizar()
        clearTimeout(timer)
        armar()
      }
    }
    // Relógio ou dados mudaram (a demonstração pode ter ligado o relógio correndo): redesenha e rearma.
    const aoMudar = () => {
      atualizar()
      clearTimeout(timer)
      armar()
    }
    armar()
    document.addEventListener('visibilitychange', aoVoltar)
    window.addEventListener('focus', aoVoltar)
    window.addEventListener('pageshow', aoVoltar)
    window.addEventListener(EVENTO, aoMudar)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', aoVoltar)
      window.removeEventListener('focus', aoVoltar)
      window.removeEventListener('pageshow', aoVoltar)
      window.removeEventListener(EVENTO, atualizar)
    }
  }, [])
  return agora()
}
