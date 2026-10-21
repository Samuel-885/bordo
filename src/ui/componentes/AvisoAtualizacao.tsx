import { useEffect, useState } from 'react'
import { aplicarAtualizacao, EVENTO_NOVA_VERSAO } from '../../pwa'

/** Versão nova do app pronta: a troca só acontece quando a pessoa toca em Atualizar. */
export function AvisoAtualizacao() {
  const [pronta, setPronta] = useState(false)
  useEffect(() => {
    const aoAvisar = () => setPronta(true)
    window.addEventListener(EVENTO_NOVA_VERSAO, aoAvisar)
    return () => window.removeEventListener(EVENTO_NOVA_VERSAO, aoAvisar)
  }, [])
  if (!pronta) return null
  return (
    <div className="aviso-atualizacao" role="status">
      <span>Nova versão do Bordo. Atualize com o ônibus parado.</span>
      <button type="button" className="botao pequeno principal" onClick={aplicarAtualizacao}>
        Atualizar
      </button>
      <button type="button" className="botao pequeno" onClick={() => setPronta(false)}>
        Depois
      </button>
    </div>
  )
}
