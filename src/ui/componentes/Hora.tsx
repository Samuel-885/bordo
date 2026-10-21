import { naHoraDoDia, mesmoInstante } from '../../core/tempo'
import type { Instante } from '../../core/tipos'
import { formatarHora } from '../logica/horarios'

interface Props {
  instante: Instante
  agora: Instante
}

/** Horário em fonte mono; fora do dia de hoje, mostra o dia embaixo ("dia 15"). */
export function Hora({ instante, agora }: Props) {
  const hoje = mesmoInstante(naHoraDoDia(instante, '00:00'), naHoraDoDia(agora, '00:00'))
  return (
    <span className="hora-com-dia">
      <span className="mono">{formatarHora(instante)}</span>
      {!hoje && <small>dia {Number(instante.slice(8, 10))}</small>}
    </span>
  )
}
