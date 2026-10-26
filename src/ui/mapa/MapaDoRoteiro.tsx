// Mapa do roteiro: paradas com marcadores por situação, linhas retas entre elas (não são a rota
// por estrada), as alternativas da próxima parada e, a pedido, a posição de agora (uma leitura
// do GPS, sem rastreamento e sem guardar nada). Tela cheia sobre a viagem; o botão voltar fecha.

import { useEffect, useRef, useState } from 'react'
import type { LayerGroup, Map as MapaLeaflet } from 'leaflet'
import { CONFIG } from '../../core/config'
import type { Instante } from '../../core/tipos'
import { lerPosicao } from '../../servicos/localizacao'
import { Topo } from '../componentes/Topo'
import { formatarHora } from '../logica/horarios'
import { textoDosSemCoordenadas, type MapaDoRoteiro } from '../logica/mapaRoteiro'
import { vistaInicial } from '../logica/mapa'
import { textoDoErroDeGpsNoMapa } from '../logica/servicos'
import { ROTULO_MARCADOR } from '../viagem/marcadores'
import { useOnline } from '../useOnline'
import { useVoltarFecha } from '../useVoltarFecha'
import { carregarLeaflet, TILES_OSM, type L } from './leaflet'

interface Props {
  mapa: MapaDoRoteiro
  agora: Instante
  onFechar: () => void
}

interface Posicao {
  lat: number
  lng: number
  precisaoM: number
  hora: string
}

const caixa = (classe: string, conteudo: string, marcador = '') => `<span class="mk ${classe}" data-marcador="${marcador}">${conteudo}</span>`

export function MapaDoRoteiroTela({ mapa, agora, onFechar }: Props) {
  useVoltarFecha(true, onFechar)
  const online = useOnline()
  const dialogo = useRef<HTMLDialogElement>(null)
  const recipiente = useRef<HTMLDivElement>(null)
  const leaflet = useRef<MapaLeaflet | null>(null)
  const camada = useRef<LayerGroup | null>(null)
  const lib = useRef<L | null>(null)
  const enquadrou = useRef(false)
  const agoraRef = useRef(agora)
  agoraRef.current = agora
  const [pronto, setPronto] = useState(false)
  const [falhaDoCodigo, setFalhaDoCodigo] = useState(false)
  const [tilesFalharam, setTilesFalharam] = useState(false)
  const [posicao, setPosicao] = useState<Posicao | null>(null)
  const [lendo, setLendo] = useState(false)
  const [erroGps, setErroGps] = useState<string | null>(null)

  useEffect(() => {
    const d = dialogo.current
    if (d && !d.open) d.showModal()
  }, [])

  useEffect(() => {
    let cancelado = false
    let criado: MapaLeaflet | null = null
    carregarLeaflet().then(
      (Leaflet) => {
        if (cancelado || !recipiente.current) return
        lib.current = Leaflet
        const vista = vistaInicial(null, null)
        criado = Leaflet.map(recipiente.current, { center: vista.centro, zoom: vista.zoom, maxZoom: TILES_OSM.zoomMaximo })
        criado.attributionControl.setPrefix(false)
        const tiles = Leaflet.tileLayer(TILES_OSM.url, { attribution: TILES_OSM.atribuicao, maxZoom: TILES_OSM.zoomMaximo })
        tiles.on('tileerror', () => setTilesFalharam(true))
        tiles.on('tileload', () => setTilesFalharam(false))
        tiles.addTo(criado)
        camada.current = Leaflet.layerGroup().addTo(criado)
        leaflet.current = criado
        setPronto(true)
      },
      () => !cancelado && setFalhaDoCodigo(true),
    )
    return () => {
      cancelado = true
      criado?.remove()
      leaflet.current = null
      camada.current = null
      setPronto(false)
    }
  }, [])

  // O desenho só muda quando o conteúdo muda (o relógio redesenha a tela a cada segundo).
  const assinatura = JSON.stringify([mapa, posicao])
  useEffect(() => {
    const m = leaflet.current
    const grupo = camada.current
    const Leaflet = lib.current
    if (!pronto || !m || !grupo || !Leaflet) return
    grupo.clearLayers()
    const pontos: [number, number][] = []
    const nota = (nome: string, detalhe: string) => {
      const el = document.createElement('div')
      const t = document.createElement('strong')
      t.textContent = nome
      el.append(t, document.createElement('br'), detalhe)
      return el
    }
    const icone = (html: string) => Leaflet.divIcon({ className: 'mk-caixa', html, iconSize: [44, 44], iconAnchor: [22, 22] })

    for (const s of mapa.segmentos) {
      Leaflet.polyline([s.de, s.para], { className: s.percorrido ? 'linha-mapa percorrida' : 'linha-mapa adiante', interactive: false }).addTo(grupo)
    }
    for (const a of mapa.alternativas) {
      if (a.ligadaA) Leaflet.polyline([a.ligadaA, a.ponto], { className: 'linha-mapa alternativa', interactive: false }).addTo(grupo)
      Leaflet.marker(a.ponto, { icon: icone(caixa('mk-alternativa', '', 'alternativa')), title: `Alternativa: ${a.nome}` })
        .bindPopup(nota(a.nome, 'Alternativa para a próxima parada'))
        .addTo(grupo)
      pontos.push([a.ponto.lat, a.ponto.lng])
    }
    for (const p of mapa.paradas) {
      const conteudo = p.incluida ? '+' : p.marcador === 'feita' || p.marcador === 'aqui' ? '✓' : String(p.ordem)
      const classe = `mk-${p.marcador}${p.incluida ? ' mk-incluida' : ''}`
      const rotulo = `${ROTULO_MARCADOR[p.marcador]}${p.incluida ? ' · incluída em viagem' : ''}${p.localNome && p.localNome !== p.nome ? ` · ${p.localNome}` : ''}`
      Leaflet.marker(p.ponto, { icon: icone(caixa(classe, conteudo, p.marcador)), title: `${p.nome} (${rotulo})`, zIndexOffset: p.marcador === 'proxima' ? 500 : 0 })
        .bindPopup(nota(p.nome, rotulo))
        .addTo(grupo)
      pontos.push([p.ponto.lat, p.ponto.lng])
    }
    if (posicao) {
      Leaflet.circle([posicao.lat, posicao.lng], { radius: posicao.precisaoM, className: 'precisao-mapa', interactive: false }).addTo(grupo)
      Leaflet.marker([posicao.lat, posicao.lng], { icon: icone(caixa('mk-posicao', '', 'posicao')), title: 'Minha posição', zIndexOffset: 1000 })
        .bindPopup(nota('Minha posição', `às ${posicao.hora}, precisão de cerca de ${Math.round(posicao.precisaoM)} m`))
        .addTo(grupo)
      pontos.push([posicao.lat, posicao.lng])
    }
    // Enquadra tudo na abertura e quando a posição chega; depois o mapa é da pessoa.
    if (pontos.length > 0 && (!enquadrou.current || posicao)) {
      enquadrou.current = true
      m.fitBounds(pontos, { padding: [48, 48], maxZoom: CONFIG.mapaZoomDoPonto })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pronto, assinatura])

  async function minhaPosicao() {
    setLendo(true)
    setErroGps(null)
    const r = await lerPosicao()
    setLendo(false)
    if (!r.ok) return setErroGps(textoDoErroDeGpsNoMapa(r.erro))
    setPosicao({ lat: r.posicao.lat, lng: r.posicao.lng, precisaoM: r.posicao.precisaoM, hora: formatarHora(agoraRef.current) })
  }

  const semTiles = !online || tilesFalharam
  const fora = textoDosSemCoordenadas(mapa.semCoordenadas)
  const nada = mapa.paradas.length === 0 && mapa.alternativas.length === 0
  return (
    <dialog ref={dialogo} className="mapa-folha" aria-label="Mapa do roteiro" onCancel={(e) => { e.preventDefault(); onFechar() }}>
      <Topo titulo="Mapa do roteiro" onVoltar={onFechar} rotuloVoltar="Fechar o mapa" />
      <div className="mapa-folha-corpo">
        <div ref={recipiente} className="mapa-tela grande" role="application" aria-label="Mapa do roteiro" data-teste="mapa-roteiro" />
        {!pronto && !falhaDoCodigo && <p className="dica">Carregando o mapa…</p>}
        {falhaDoCodigo && <p className="msg-erro" role="status">Não foi possível carregar o mapa.</p>}
        {semTiles && (
          <p className="dica atencao-texto" role="status" data-teste="mapa-sem-internet">
            Sem internet ou sinal fraco: o mapa não carrega. O resto do app funciona normalmente.
          </p>
        )}
        {nada && <p className="dica" data-teste="mapa-vazio">Nenhum local do roteiro tem coordenadas, então não há o que mostrar. Cadastre-as em Locais.</p>}
        {fora && <p className="dica atencao-texto" role="status" data-teste="mapa-fora">{fora}</p>}
        <div className="mapa-acoes">
          <button type="button" className="botao" onClick={() => void minhaPosicao()} disabled={lendo}>
            {lendo ? 'Lendo o GPS…' : 'Minha posição'}
          </button>
        </div>
        {erroGps && <p className="msg-erro" role="status" data-teste="mapa-erro-gps">{erroGps}</p>}
        {posicao && (
          <p className="dica" role="status" data-teste="mapa-posicao">
            Posição às {posicao.hora}, precisão de cerca de {Math.round(posicao.precisaoM)} m. É uma leitura só: o mapa não acompanha o ônibus.
          </p>
        )}
        <ul className="mapa-legenda" aria-label="Legenda">
          <li><span className="mk mk-feita mini">✓</span> Feita</li>
          <li><span className="mk mk-proxima mini">2</span> Próxima</li>
          <li><span className="mk mk-futura mini">3</span> Adiante</li>
          <li><span className="mk mk-futura mk-incluida mini">+</span> Incluída em viagem</li>
          <li><span className="mk mk-alternativa mini" /> Alternativa</li>
        </ul>
        <p className="dica">As linhas são retas entre as paradas: não mostram a estrada.</p>
      </div>
    </dialog>
  )
}
