// Link comum do Google Maps para a próxima etapa. Sem API, sem chave, sem cobrança.

import type { Local } from '../../core/tipos'

const BASE = 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination='

/** Por coordenadas; sem elas, por nome e cidade. Sem local escolhido, não há link. */
export function linkGoogleMaps(local: Pick<Local, 'nome' | 'cidade' | 'coordenadas'> | undefined): string | null {
  if (!local) return null
  if (local.coordenadas) return `${BASE}${local.coordenadas.lat},${local.coordenadas.lng}`
  const consulta = [local.nome, local.cidade].map((t) => t.trim()).filter(Boolean).join(', ')
  return consulta ? `${BASE}${encodeURIComponent(consulta)}` : null
}
