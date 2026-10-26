import { describe, expect, it } from 'vitest'
import { montarMapaDoRoteiro, textoDosSemCoordenadas, type ParadaEntrada } from '../mapaRoteiro'

const ponto = (n: number) => ({ lat: -19 - n / 10, lng: -42 - n / 10 })
const parada = (n: number, marcador: ParadaEntrada['marcador'], extra: Partial<ParadaEntrada> = {}): ParadaEntrada => ({
  etapaId: `e${n}`,
  localId: `l${n}`,
  nome: `Parada ${n}`,
  marcador,
  incluida: false,
  ponto: ponto(n),
  ...extra,
})

describe('mapa do roteiro', () => {
  it('desenha uma linha reta entre paradas vizinhas; a percorrida termina numa parada feita ou atual', () => {
    const m = montarMapaDoRoteiro([parada(1, 'feita'), parada(2, 'aqui'), parada(3, 'proxima'), parada(4, 'futura')], [])
    expect(m.paradas.map((p) => [p.ordem, p.marcador])).toEqual([[1, 'feita'], [2, 'aqui'], [3, 'proxima'], [4, 'futura']])
    expect(m.segmentos.map((s) => s.percorrido)).toEqual([true, false, false])
    expect(m.segmentos[0]).toMatchObject({ de: ponto(1), para: ponto(2) })
  })

  it('local sem coordenadas não aparece, quebra a linha (não liga os vizinhos) e é contado', () => {
    const m = montarMapaDoRoteiro([parada(1, 'feita'), parada(2, 'proxima', { ponto: null }), parada(3, 'futura'), parada(4, 'futura')], [])
    expect(m.paradas.map((p) => p.nome)).toEqual(['Parada 1', 'Parada 3', 'Parada 4'])
    expect(m.segmentos).toHaveLength(1)
    expect(m.segmentos[0]).toMatchObject({ de: ponto(3), para: ponto(4) })
    expect(m.semCoordenadas).toEqual(['Parada 2'])
  })

  it('parada pulada fica sem linha: a viagem passa direto e liga a anterior à seguinte', () => {
    const m = montarMapaDoRoteiro([parada(1, 'feita'), parada(2, 'pulada'), parada(3, 'proxima')], [])
    expect(m.paradas).toHaveLength(3)
    expect(m.segmentos).toHaveLength(1)
    expect(m.segmentos[0]).toMatchObject({ de: ponto(1), para: ponto(3) })
  })

  it('parada incluída em viagem mantém a situação e leva a marca de incluída', () => {
    const m = montarMapaDoRoteiro([parada(1, 'feita'), parada(2, 'futura', { incluida: true })], [])
    expect(m.paradas[1]).toMatchObject({ marcador: 'futura', incluida: true })
  })

  it('alternativas da próxima parada flexível se ligam à parada que vem antes dela; o local que a etapa já usa não se repete', () => {
    const m = montarMapaDoRoteiro(
      [parada(1, 'feita'), parada(2, 'proxima'), parada(3, 'futura')],
      [
        { localId: 'l3', nome: 'Parada 3', ponto: ponto(3) },
        { localId: 'a1', nome: 'Alternativa A', ponto: ponto(7) },
        { localId: 'a2', nome: 'Alternativa B', ponto: null },
      ],
      'e3',
    )
    expect(m.alternativas).toEqual([{ localId: 'a1', nome: 'Alternativa A', ponto: ponto(7), ligadaA: ponto(2) }])
    expect(m.semCoordenadas).toEqual(['Alternativa B'])
  })

  it('sem coordenadas em nenhum local: nada a mostrar e todos contados', () => {
    const m = montarMapaDoRoteiro([parada(1, 'feita', { ponto: null }), parada(2, 'proxima', { ponto: null })], [])
    expect(m.paradas).toEqual([])
    expect(m.segmentos).toEqual([])
    expect(m.semCoordenadas).toHaveLength(2)
  })

  it('um mesmo local em duas paradas é contado uma vez', () => {
    const m = montarMapaDoRoteiro([parada(1, 'feita', { ponto: null, localId: 'x' }), parada(2, 'proxima', { ponto: null, localId: 'x' })], [])
    expect(m.semCoordenadas).toHaveLength(1)
  })

  it('texto de quantos ficaram de fora', () => {
    expect(textoDosSemCoordenadas([])).toBeNull()
    expect(textoDosSemCoordenadas(['A'])).toBe('1 local sem coordenadas não aparece no mapa: A. Cadastre as coordenadas em Locais.')
    expect(textoDosSemCoordenadas(['A', 'B'])).toBe('2 locais sem coordenadas não aparecem no mapa: A, B. Cadastre as coordenadas em Locais.')
  })
})
