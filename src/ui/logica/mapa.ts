// Regras do mapa do cadastro de local que não dependem do Leaflet: onde abrir e o link de conferência.

import { CONFIG } from '../../core/config'
import type { Ponto } from '../../core/rotas'
import { lerCoordenadas } from './coordenadas'
import { linkGoogleMaps } from './linkMaps'

export interface VistaDoMapa {
  centro: Ponto
  zoom: number
}

/** O Brasil inteiro, só para abrir quando não há ponto nem local com coordenadas. */
const CENTRO_SEM_REFERENCIA: Ponto = { lat: -14.2, lng: -51.9 }

/** Abre no pino, se há; senão no centro dos locais do catálogo; senão no Brasil. */
export function vistaInicial(ponto: Ponto | null, centroDoCatalogo: Ponto | null): VistaDoMapa {
  if (ponto) return { centro: ponto, zoom: CONFIG.mapaZoomDoPonto }
  if (centroDoCatalogo) return { centro: centroDoCatalogo, zoom: CONFIG.mapaZoomDoCatalogo }
  return { centro: CENTRO_SEM_REFERENCIA, zoom: CONFIG.mapaZoomSemReferencia }
}

/** O ponto do campo de coordenadas; nulo se vazio ou inválido (o pino então fica onde está). */
export function pontoDoTexto(texto: string): Ponto | null {
  if (!texto.trim()) return null
  const c = lerCoordenadas(texto)
  return c.ok ? c.coordenadas : null
}

/** Seis casas (cerca de 10 cm) bastam para um pino arrastado ou tocado. */
export function arredondarPonto(p: Ponto): Ponto {
  const r = (n: number) => Math.round(n * 1e6) / 1e6
  return { lat: r(p.lat), lng: r(p.lng) }
}

/** "Conferir no Google Maps": o mesmo link de rota das outras telas, pelas coordenadas do pino. Sem coordenadas válidas, não há link. */
export function linkConferirNoMaps(texto: string): string | null {
  const ponto = pontoDoTexto(texto)
  return ponto ? linkGoogleMaps({ nome: '', cidade: '', coordenadas: ponto }) : null
}
