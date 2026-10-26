// O Leaflet (código e estilos) só é baixado quando um mapa é aberto: fica num pedaço à parte do
// build e não pesa a abertura do app. O service worker guarda esse pedaço, então a tela do mapa
// abre sem internet; só os tiles precisam de rede (e eles nunca entram no cache do service worker).

import type * as Leaflet from 'leaflet'

export type L = typeof Leaflet

let carregando: Promise<L> | null = null

export function carregarLeaflet(): Promise<L> {
  carregando ??= Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')])
    .then(([m]) => (m.default ?? m) as L)
    .catch((e) => {
      carregando = null
      throw e
    })
  return carregando
}

/** Tiles do OpenStreetMap (política: operations.osmfoundation.org/policies/tiles). A atribuição fica sempre visível no mapa. */
export const TILES_OSM = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  atribuicao: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
  zoomMaximo: 19,
}
