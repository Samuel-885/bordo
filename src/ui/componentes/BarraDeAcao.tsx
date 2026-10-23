// Rodapé fixo acima das abas: a ação principal gigante e até três ações rápidas.

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
}

export function BarraDeAcao({ principal, rapidas, ocupado, erro }: Props) {
  return (
    <div className="barra-acao" role="group" aria-label="Ações da viagem">
      {erro && <p className="msg-erro" role="alert">{erro}</p>}
      {principal && (
        <button type="button" className="botao-principal" disabled={ocupado || principal.desabilitada} onClick={principal.onClick}>
          {principal.rotulo}
        </button>
      )}
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
