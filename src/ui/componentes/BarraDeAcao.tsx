// Rodapé fixo acima das abas. Na aba Viagem: a ação principal gigante e até três ações
// rápidas. Nas outras abas: a barra compacta, com a previsão do destino e a ação principal,
// para nunca precisar voltar à aba Viagem para registrar.

import type { ReactNode } from 'react'

export interface AcaoDoRodape {
  rotulo: string
  onClick: () => void
  desabilitada?: boolean
  /** Dica curta quando a ação está desligada (vai no title e no aria). */
  dica?: string
}

interface Props {
  principal: AcaoDoRodape | null
  rapidas: AcaoDoRodape[]
  ocupado: boolean
  erro?: string | null
  /** Barra compacta (~52 px): a previsão do destino à esquerda e a ação principal. */
  compacta?: { previsao: ReactNode }
}

export function BarraDeAcao({ principal, rapidas, ocupado, erro, compacta }: Props) {
  const botaoPrincipal = principal && (
    <button type="button" className="botao-principal" disabled={ocupado || principal.desabilitada} onClick={principal.onClick}>
      {principal.rotulo}
    </button>
  )
  if (compacta) {
    return (
      <div className="barra-acao compacta" role="group" aria-label="Ação da viagem" data-teste="barra-compacta">
        {erro && <p className="msg-erro" role="alert">{erro}</p>}
        <div className="compacta-linha">
          <div className="compacta-previsao">{compacta.previsao}</div>
          {botaoPrincipal}
        </div>
      </div>
    )
  }
  return (
    <div className="barra-acao" role="group" aria-label="Ações da viagem">
      {erro && <p className="msg-erro" role="alert">{erro}</p>}
      {botaoPrincipal}
      <div className="acoes-rapidas">
        {rapidas.map((a) => (
          <button key={a.rotulo} type="button" className="botao rapida" disabled={ocupado || a.desabilitada} title={a.dica} onClick={a.onClick}>
            {a.rotulo}
          </button>
        ))}
      </div>
    </div>
  )
}
