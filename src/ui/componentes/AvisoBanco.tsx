import { useEffect, useState } from 'react'
import { assinarAvisosDoBanco, TEXTO_ATUALIZADO, TEXTO_BLOQUEADO, type AvisoDoBanco } from '../../data/avisoBanco'

/** O app está aberto em outro lugar: o banco foi atualizado ou a abertura está bloqueada. Tocar recarrega. */
export function AvisoBanco() {
  const [aviso, setAviso] = useState<AvisoDoBanco | null>(null)
  useEffect(() => assinarAvisosDoBanco(setAviso), [])
  if (!aviso) return null
  return (
    <button type="button" className="aviso-banco" role="alert" onClick={() => window.location.reload()}>
      {aviso === 'atualizado' ? TEXTO_ATUALIZADO : TEXTO_BLOQUEADO}
    </button>
  )
}
