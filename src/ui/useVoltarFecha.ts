import { useEffect, useRef } from 'react'

/**
 * Enquanto `aberto`, o botão voltar do celular fecha a tela sobreposta em vez de sair da
 * viagem. Abre uma entrada extra no histórico e a desfaz ao fechar por outro caminho.
 */
export function useVoltarFecha(aberto: boolean, fechar: () => void): void {
  const ultimoFechar = useRef(fechar)
  useEffect(() => {
    ultimoFechar.current = fechar
  })

  useEffect(() => {
    if (!aberto) return
    let desfeito = false
    window.history.pushState(window.history.state, '')
    const aoVoltar = () => {
      desfeito = true
      ultimoFechar.current()
    }
    window.addEventListener('popstate', aoVoltar)
    return () => {
      window.removeEventListener('popstate', aoVoltar)
      if (!desfeito) window.history.back()
    }
  }, [aberto])
}
