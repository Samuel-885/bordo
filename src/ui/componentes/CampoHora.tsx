import { avisoDeDia } from '../logica/horarioDigitado'
import type { Instante } from '../../core/tipos'

interface Props {
  id: string
  rotulo: string
  valor: string
  onMudar: (v: string) => void
  /** O horário em que o texto digitado foi resolvido, para mostrar o dia quando não é hoje. */
  resolvido: Instante | null
  agora: Instante
  dica?: string
}

export function CampoHora({ id, rotulo, valor, onMudar, resolvido, agora, dica }: Props) {
  const dia = avisoDeDia(resolvido, agora)
  return (
    <div className="campo">
      <label htmlFor={id}>{rotulo}</label>
      <input id={id} type="time" value={valor} onChange={(e) => onMudar(e.target.value)} required />
      {dia && <p className="dica"><strong>{dia}</strong></p>}
      {dica && <p className="dica">{dica}</p>}
    </div>
  )
}
