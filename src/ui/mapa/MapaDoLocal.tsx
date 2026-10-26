import { useEffect, useRef, useState } from 'react'
import type { Map as MapaLeaflet, Marker } from 'leaflet'
import type { Ponto } from '../../core/rotas'
import { arredondarPonto, vistaInicial } from '../logica/mapa'
import { CONFIG } from '../../core/config'
import { carregarLeaflet, TILES_OSM, type L } from './leaflet'

interface Props {
  /** O ponto do campo de coordenadas; nulo = sem pino. */
  ponto: Ponto | null
  centroDoCatalogo: Ponto | null
  online: boolean
  /** O pino foi arrastado ou o mapa foi tocado. */
  onMover: (p: Ponto) => void
}

const mesmo = (a: Ponto, b: Ponto) => Math.abs(a.lat - b.lat) < 1e-9 && Math.abs(a.lng - b.lng) < 1e-9

const PINO = `<svg viewBox="0 0 44 44" width="44" height="44" aria-hidden="true"><path d="M22 42 C22 42 8 28 8 18 a14 14 0 0 1 28 0 C36 28 22 42 22 42Z" fill="#1f4d43" stroke="#fff" stroke-width="2.5"/><circle cx="22" cy="18" r="5.5" fill="#5e8f2e" stroke="#fff" stroke-width="2"/></svg>`

/** Mapa com um pino arrastável. O estado é o campo de coordenadas do formulário: o pino só o lê e o escreve. */
export function MapaDoLocal({ ponto, centroDoCatalogo, online, onMover }: Props) {
  const recipiente = useRef<HTMLDivElement>(null)
  const mapa = useRef<MapaLeaflet | null>(null)
  const pino = useRef<Marker | null>(null)
  const lib = useRef<L | null>(null)
  const aoMover = useRef(onMover)
  aoMover.current = onMover
  const [pronto, setPronto] = useState(false)
  const [falhaDoCodigo, setFalhaDoCodigo] = useState(false)
  const [tilesFalharam, setTilesFalharam] = useState(false)

  useEffect(() => {
    let cancelado = false
    let criado: MapaLeaflet | null = null
    carregarLeaflet().then(
      (Leaflet) => {
        if (cancelado || !recipiente.current) return
        lib.current = Leaflet
        const vista = vistaInicial(ponto, centroDoCatalogo)
        criado = Leaflet.map(recipiente.current, { center: vista.centro, zoom: vista.zoom, maxZoom: TILES_OSM.zoomMaximo, attributionControl: true })
        criado.attributionControl.setPrefix(false)
        const tiles = Leaflet.tileLayer(TILES_OSM.url, { attribution: TILES_OSM.atribuicao, maxZoom: TILES_OSM.zoomMaximo })
        tiles.on('tileerror', () => setTilesFalharam(true))
        tiles.on('tileload', () => setTilesFalharam(false))
        tiles.addTo(criado)
        criado.on('click', (e) => {
          const p = arredondarPonto({ lat: e.latlng.lat, lng: e.latlng.lng })
          colocarPino(p)
          aoMover.current(p)
        })
        mapa.current = criado
        setPronto(true)
      },
      () => !cancelado && setFalhaDoCodigo(true),
    )
    return () => {
      cancelado = true
      criado?.remove()
      mapa.current = null
      pino.current = null
      setPronto(false)
    }
    // Só na abertura: depois disso o pino segue o campo pelo efeito abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function colocarPino(p: Ponto) {
    const m = mapa.current
    const Leaflet = lib.current
    if (!m || !Leaflet) return
    if (pino.current) return void pino.current.setLatLng(p)
    const marcador = Leaflet.marker(p, {
      draggable: true,
      title: 'Pino do local: arraste para ajustar',
      icon: Leaflet.divIcon({ className: 'pino-mapa', html: PINO, iconSize: [44, 44], iconAnchor: [22, 42] }),
    })
    marcador.on('dragend', () => {
      const { lat, lng } = marcador.getLatLng()
      const novo = arredondarPonto({ lat, lng })
      marcador.setLatLng(novo)
      aoMover.current(novo)
    })
    marcador.addTo(m)
    pino.current = marcador
  }

  // O pino segue o campo: busca, coordenadas coladas e digitadas movem o pino e centralizam o mapa.
  useEffect(() => {
    const m = mapa.current
    if (!pronto || !m) return
    if (!ponto) {
      pino.current?.remove()
      pino.current = null
      return
    }
    const atual = pino.current?.getLatLng()
    if (atual && mesmo(atual, ponto)) return
    colocarPino(ponto)
    m.setView(ponto, Math.max(m.getZoom(), CONFIG.mapaZoomDoPonto))
  }, [pronto, ponto?.lat, ponto?.lng]) // eslint-disable-line react-hooks/exhaustive-deps

  const semTiles = !online || tilesFalharam
  return (
    <div className="mapa-local" data-teste="mapa-local" data-pino={ponto ? `${ponto.lat},${ponto.lng}` : ''}>
      <div ref={recipiente} className="mapa-tela" role="application" aria-label="Mapa para marcar o local. Toque no mapa ou arraste o pino." />
      {!pronto && !falhaDoCodigo && <p className="dica">Carregando o mapa…</p>}
      {falhaDoCodigo && <p className="msg-erro" role="status">Não foi possível carregar o mapa. Preencha as coordenadas no campo abaixo.</p>}
      {semTiles && (
        <p className="dica atencao-texto" role="status" data-teste="mapa-sem-internet">
          Sem internet ou sinal fraco: o mapa não carrega. O resto do formulário funciona; você pode colar as coordenadas.
        </p>
      )}
    </div>
  )
}
