import { agora, simuladoAtivo } from '../../core/relogio'
import { formatarHora } from '../logica/horarios'

interface Props {
  onReiniciar: () => void
  onSair: () => void
}

/** Sempre visível enquanto o relógio simulado está ligado. */
export function FaixaDemo({ onReiniciar, onSair }: Props) {
  if (!simuladoAtivo()) return null
  return (
    <div className="faixa-demo" role="status">
      <strong>
        MODO DEMONSTRAÇÃO <span className="mono">· {formatarHora(agora())}</span>
      </strong>
      <button type="button" className="botao pequeno" onClick={onReiniciar}>
        Reiniciar
      </button>
      <button type="button" className="botao pequeno" onClick={onSair}>
        Sair
      </button>
    </div>
  )
}
