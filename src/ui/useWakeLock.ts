import { useEffect } from 'react'

/**
 * Mantém a tela acesa enquanto `ativo` (quando o navegador permite). O sistema solta o
 * bloqueio ao ir para segundo plano, então ele é pedido de novo ao voltar à aba.
 */
export function useWakeLock(ativo: boolean): void {
  useEffect(() => {
    if (!ativo || !('wakeLock' in navigator)) return
    let vivo = true
    let sentinela: WakeLockSentinel | null = null

    const pedir = async () => {
      try {
        const s = await navigator.wakeLock.request('screen')
        if (vivo) sentinela = s
        else void s.release()
      } catch {
        // Sem permissão (economia de bateria, por exemplo): a conferência segue sem isso.
      }
    }
    const aoMudarVisibilidade = () => {
      if (document.visibilityState === 'visible' && (!sentinela || sentinela.released)) void pedir()
    }

    void pedir()
    document.addEventListener('visibilitychange', aoMudarVisibilidade)
    return () => {
      vivo = false
      document.removeEventListener('visibilitychange', aoMudarVisibilidade)
      void sentinela?.release()
    }
  }, [ativo])
}
