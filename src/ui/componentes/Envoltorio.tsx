import type { ReactNode } from 'react'

/** Tela cheia (com <main>) ou, dentro de uma aba, só o conteúdo. */
export function Envoltorio({ incorporada, children }: { incorporada?: boolean; children: ReactNode }) {
  return incorporada ? <div className="aba-interna">{children}</div> : <main className="conteudo">{children}</main>
}
