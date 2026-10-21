import { useCallback, useEffect, useRef, useState } from 'react'
import { mensagemDeErroDoBanco } from '../data/avisoBanco'

export interface Dados<T> {
  dados: T | null
  erro: string | null
  recarregar: () => void
}

/**
 * Carrega do banco ao abrir a tela, quando `chave` muda e quando `recarregar()` é
 * chamado. `chave` identifica o que está sendo lido (por exemplo, o id da viagem).
 */
export function useDados<T>(carregar: () => Promise<T>, chave: string): Dados<T> {
  const [estado, setEstado] = useState<{ dados: T | null; erro: string | null }>({ dados: null, erro: null })
  const [versao, setVersao] = useState(0)
  const ultimoCarregar = useRef(carregar)
  useEffect(() => {
    ultimoCarregar.current = carregar
  })

  useEffect(() => {
    let vivo = true
    ultimoCarregar.current().then(
      (dados) => vivo && setEstado({ dados, erro: null }),
      (e: unknown) => vivo && setEstado({ dados: null, erro: mensagemDeErroDoBanco(e, 'Erro ao ler os dados.') }),
    )
    return () => {
      vivo = false
    }
  }, [versao, chave])

  const recarregar = useCallback(() => setVersao((v) => v + 1), [])
  return { ...estado, recarregar }
}
