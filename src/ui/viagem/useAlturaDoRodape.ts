// Mede o rodapé fixo (barra de ação + abas) e publica a altura em --rodape, para o conteúdo
// e o aviso DESFAZER nunca ficarem por baixo dele.

import { useCallback, useEffect, useRef } from 'react'

export function useAlturaDoRodape() {
  const observador = useRef<ResizeObserver | null>(null)
  useEffect(() => () => {
    observador.current?.disconnect()
    document.documentElement.style.removeProperty('--rodape')
  }, [])
  return useCallback((el: HTMLElement | null) => {
    observador.current?.disconnect()
    if (!el) return
    const publicar = () => document.documentElement.style.setProperty('--rodape', `${el.offsetHeight}px`)
    publicar()
    observador.current = new ResizeObserver(publicar)
    observador.current.observe(el)
  }, [])
}
