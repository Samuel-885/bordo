import { classificarAtraso } from '../../core/atraso'
import { textoDoAtraso } from '../logica/textosViagem'

/** O atraso no destino: "+17 min", "No horário" ou "−5 min". */
export function SeloDeAtraso({ minutos, compacto }: { minutos: number; compacto?: boolean }) {
  const classe = classificarAtraso(minutos)
  return (
    <span className={`selo-atraso ${classe.situacao}${compacto ? ' compacto' : ''}`} aria-live="polite">
      {classe.situacao === 'no_horario' ? 'No horário' : textoDoAtraso(classe.minutos)}
      {classe.situacao === 'no_horario' && classe.minutos !== 0 ? ` (${classe.minutos > 0 ? '+' : '−'}${Math.abs(classe.minutos)} min)` : ''}
    </span>
  )
}
