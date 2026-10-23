// Fase 8: leitura das respostas dos serviços, pares a calcular, rota × manual × roteiro e fator ônibus.
// Nada de rede: as respostas abaixo são simuladas. Locais e nomes são fictícios.

import { describe, expect, it } from 'vitest'
import { CONFIG } from '../config'
import { FORMATO_ATUAL, montarBackup, serializarBackup, validarBackup, type ConteudoBackup } from '../backup'
import {
  aplicarRota,
  compararManualComRota,
  fatorImplicito,
  fatorSugeridoPeloRoteiro,
  interpretarBuscaPhoton,
  interpretarRotaOsrm,
  manterManual,
  paresParaCalcular,
  respostaSemCaminho,
  rotaDoTrecho,
  trechoManualComRota,
  usarRotaNoLugarDoManual,
  validarFatorOnibus,
} from '../rotas'
import { duracaoTrecho } from '../trechos'
import type { DadosPlano, Local, RotaDoTrecho, Trecho } from '../tipos'
import { ETAPAS, LOCAIS, PASSAGEIROS, PLANO, congelar, h } from './fixtures'

const PAR = { etapaOrigemId: 'monlevade', localOrigemId: 'l-monlevade', etapaDestinoId: 'almoco', localDestinoId: 'l-rest-b' }
const CALCULADO = h('07:00')

function comCoordenadas(extra: Partial<Record<string, Local['coordenadas']>> = {}): DadosPlano {
  const locais = LOCAIS.map((l, i) => ({ ...l, coordenadas: { lat: -19 - i / 10, lng: -42 - i / 10 } }))
  return { ...PLANO, locais: locais.map((l) => (l.id in extra ? { ...l, coordenadas: extra[l.id] } : l)) }
}

const rota = (duracaoMin: number): RotaDoTrecho => ({ duracaoMin, distanciaKm: 90, calculadoEm: CALCULADO })

describe('fase 8: resposta do OSRM', () => {
  const ok = (duration: number, distance: number) => ({ code: 'Ok', routes: [{ duration, distance, legs: [] }], waypoints: [] })

  it('lê o tempo de carro (minutos, para cima) e a distância (km, uma casa)', () => {
    expect(interpretarRotaOsrm(ok(5566.6, 96699.2))).toEqual({ minutosCarro: 93, distanciaKm: 96.7 })
  })

  it('segundos exatos de minuto inteiro não ganham um minuto; um segundo a mais ganha', () => {
    expect(interpretarRotaOsrm(ok(5400, 1000))?.minutosCarro).toBe(90)
    expect(interpretarRotaOsrm(ok(5401, 1000))?.minutosCarro).toBe(91)
    expect(interpretarRotaOsrm(ok(20, 100))?.minutosCarro).toBe(1)
  })

  it.each([
    ['sem objeto', null],
    ['texto', 'erro'],
    ['código diferente de Ok', { code: 'NoRoute', routes: [] }],
    ['lista de rotas vazia', { code: 'Ok', routes: [] }],
    ['sem lista de rotas', { code: 'Ok' }],
    ['rota que não é objeto', { code: 'Ok', routes: [null] }],
    ['duração em texto', ok('5566' as unknown as number, 1000)],
    ['duração zero', ok(0, 0)],
    ['duração negativa', ok(-5, 100)],
    ['duração infinita', ok(Infinity, 100)],
    ['distância não numérica', ok(100, NaN)],
  ])('resposta vazia ou inválida (%s) não vira tempo', (_nome, json) => {
    expect(interpretarRotaOsrm(json)).toBeNull()
  })

  it('reconhece os códigos de "sem caminho"', () => {
    expect(respostaSemCaminho({ code: 'NoRoute' })).toBe(true)
    expect(respostaSemCaminho({ code: 'NoSegment' })).toBe(true)
    expect(respostaSemCaminho({ code: 'InvalidQuery' })).toBe(false)
    expect(respostaSemCaminho(null)).toBe(false)
  })
})

describe('fase 8: resposta do Photon', () => {
  const ponto = (lng: number, lat: number) => ({ type: 'Point', coordinates: [lng, lat] })
  const f = (properties: Record<string, unknown>, geometry: unknown = ponto(-43.17, -19.81)) => ({ type: 'Feature', properties, geometry })

  it('devolve latitude e longitude na ordem certa, com cidade e estado', () => {
    const [r] = interpretarBuscaPhoton({ features: [f({ name: 'Rua das Flores', city: 'Ipatinga', state: 'Minas Gerais' }, ponto(-42.5586, -19.4608))] })
    expect(r).toEqual({ nome: 'Rua das Flores', cidade: 'Ipatinga', estado: 'Minas Gerais', lat: -19.4608, lng: -42.5586 })
  })

  it('limita a 5 resultados', () => {
    const features = Array.from({ length: 8 }, (_, i) => f({ name: `Lugar ${i}`, city: 'Cidade' }))
    expect(interpretarBuscaPhoton({ features })).toHaveLength(5)
    expect(interpretarBuscaPhoton({ features }, 2)).toHaveLength(2)
  })

  it('para uma cidade, a cidade é o próprio nome; sem cidade, usa o município', () => {
    expect(interpretarBuscaPhoton({ features: [f({ name: 'João Monlevade', type: 'city', state: 'Minas Gerais' })] })[0]?.cidade).toBe('João Monlevade')
    expect(interpretarBuscaPhoton({ features: [f({ name: 'Posto X', county: 'Município Y' })] })[0]?.cidade).toBe('Município Y')
    expect(interpretarBuscaPhoton({ features: [f({ name: 'Posto X' })] })[0]?.cidade).toBe('')
  })

  it('sem nome, usa rua e número; sem nenhum dos dois, descarta', () => {
    expect(interpretarBuscaPhoton({ features: [f({ street: 'Avenida Central', housenumber: '10', city: 'Cidade' })] })[0]?.nome).toBe('Avenida Central 10')
    expect(interpretarBuscaPhoton({ features: [f({ city: 'Cidade' })] })).toEqual([])
  })

  it('descarta resultado sem coordenadas válidas e continua com os outros', () => {
    const features = [
      f({ name: 'Sem geometria' }, null),
      f({ name: 'Coordenada em texto' }, { type: 'Point', coordinates: ['a', 'b'] }),
      f({ name: 'Fora do mundo' }, ponto(-300, -19)),
      f({ name: 'Latitude fora' }, ponto(-43, 95)),
      f({ name: 'Bom', city: 'Cidade' }),
    ]
    expect(interpretarBuscaPhoton({ features }).map((r) => r.nome)).toEqual(['Bom'])
  })

  it.each([[null], [{}], [{ features: [] }], [{ features: 'x' }], ['texto']])('resposta vazia ou inesperada (%j) dá lista vazia', (json) => {
    expect(interpretarBuscaPhoton(json)).toEqual([])
  })
})

describe('fase 8: pares a calcular', () => {
  it('todos os pares de candidatos de etapas vizinhas, inclusive os que já têm roteiro', () => {
    const { calcular, semCoordenadas } = paresParaCalcular(comCoordenadas())
    // origem→monlevade 1, monlevade→almoço 3, almoço→café 3, café→jantar 1, jantar→destino 1.
    expect(calcular).toHaveLength(9)
    expect(semCoordenadas).toEqual([])
    expect(calcular.find((c) => c.par.localOrigemId === 'l-saida')?.de).toEqual({ lat: -19, lng: -42 })
  })

  it('local sem coordenadas deixa os pares dele em "sem coordenadas", sem inventar nada', () => {
    const { calcular, semCoordenadas } = paresParaCalcular(comCoordenadas({ 'l-rest-b': undefined }))
    expect(semCoordenadas.map((p) => `${p.localOrigemId}>${p.localDestinoId}`).sort()).toEqual(['l-monlevade>l-rest-b', 'l-rest-b>l-cafe'])
    expect(calcular).toHaveLength(7)
  })

  it('um local ligado a ele mesmo não tem o que calcular', () => {
    const etapas = ETAPAS.map((e) => (e.id === 'cafe' ? { ...e, localId: 'l-rest-a' } : e))
    const { calcular, semCoordenadas } = paresParaCalcular({ ...comCoordenadas(), etapas })
    expect([...calcular.map((c) => c.par), ...semCoordenadas].some((p) => p.localOrigemId === p.localDestinoId)).toBe(false)
  })
})

describe('fase 8: guardar a rota sem pisar no manual', () => {
  const calculada = { minutosCarro: 93, distanciaKm: 96.7 }

  it('sem trecho, a rota vira o trecho, com distância e data', () => {
    expect(aplicarRota(undefined, PAR, calculada, CALCULADO)).toEqual({ ...PAR, duracaoMin: 93, fonte: 'rota', distanciaKm: 96.7, calculadoEm: CALCULADO })
  })

  it('trecho de rota anterior é substituído pelo cálculo novo', () => {
    const antigo: Trecho = { ...PAR, duracaoMin: 80, fonte: 'rota', distanciaKm: 80, calculadoEm: h('06:00') }
    expect(aplicarRota(antigo, PAR, calculada, CALCULADO)).toMatchObject({ duracaoMin: 93, fonte: 'rota', distanciaKm: 96.7, calculadoEm: CALCULADO })
  })

  it('tempo manual nunca é sobrescrito: a rota fica ao lado', () => {
    const manual: Trecho = { ...PAR, duracaoMin: 200, fonte: 'manual' }
    const depois = aplicarRota(manual, PAR, calculada, CALCULADO)
    expect(depois).toMatchObject({ duracaoMin: 200, fonte: 'manual', rota: { duracaoMin: 93, distanciaKm: 96.7, calculadoEm: CALCULADO } })
  })

  it('o cálculo continua usando só o manual, mesmo com rota ao lado', () => {
    const plano: DadosPlano = { ...PLANO, trechos: [{ ...PAR, duracaoMin: 200, fonte: 'manual', rota: rota(93) }] }
    const etapa = (id: string) => plano.etapas.find((e) => e.id === id)!
    expect(duracaoTrecho(plano, etapa('monlevade'), 'l-monlevade', etapa('almoco'), 'l-rest-b')).toEqual({ minutos: 200, fonte: 'manual' })
  })

  it('digitar um tempo sobre um trecho de rota guarda a rota ao lado', () => {
    const daRota: Trecho = { ...PAR, duracaoMin: 93, fonte: 'rota', distanciaKm: 96.7, calculadoEm: CALCULADO }
    expect(trechoManualComRota(daRota, PAR, 150)).toEqual({ ...PAR, duracaoMin: 150, fonte: 'manual', rota: { duracaoMin: 93, distanciaKm: 96.7, calculadoEm: CALCULADO } })
    expect(trechoManualComRota(undefined, PAR, 150)).toEqual({ ...PAR, duracaoMin: 150, fonte: 'manual' })
  })

  it('"Usar a rota" troca o trecho para a rota e descarta o manual', () => {
    const manual: Trecho = { ...PAR, duracaoMin: 200, fonte: 'manual', rota: rota(93) }
    expect(usarRotaNoLugarDoManual(manual)).toEqual({ ...PAR, duracaoMin: 93, fonte: 'rota', distanciaKm: 90, calculadoEm: CALCULADO })
    expect(usarRotaNoLugarDoManual({ ...PAR, duracaoMin: 200, fonte: 'manual' })).toBeNull()
  })

  it('"Manter o meu" guarda o manual e descarta a rota ao lado', () => {
    const manual: Trecho = { ...PAR, duracaoMin: 200, fonte: 'manual', rota: rota(93) }
    expect(manterManual(manual)).toEqual({ ...PAR, duracaoMin: 200, fonte: 'manual' })
  })

  it('rotaDoTrecho lê a rota própria ou a que está ao lado do manual', () => {
    expect(rotaDoTrecho({ ...PAR, duracaoMin: 93, fonte: 'rota', distanciaKm: 96.7, calculadoEm: CALCULADO })).toEqual({ duracaoMin: 93, distanciaKm: 96.7, calculadoEm: CALCULADO })
    expect(rotaDoTrecho({ ...PAR, duracaoMin: 200, fonte: 'manual', rota: rota(93) })).toEqual(rota(93))
    expect(rotaDoTrecho({ ...PAR, duracaoMin: 93, fonte: 'rota' })).toBeNull()
    expect(rotaDoTrecho(undefined)).toBeNull()
  })
})

describe('fase 8: manual × rota', () => {
  // Rota de 100 min de carro × 1,15 = 115 min de ônibus.
  const r = rota(100)

  it('diferença grande = 15 min ou mais E 15% ou mais', () => {
    expect(compararManualComRota(130, r, 1.15)).toMatchObject({ onibusMin: 115, diferencaMin: 15, grande: false }) // 13%
    expect(compararManualComRota(135, r, 1.15)).toMatchObject({ diferencaMin: 20, grande: true }) // 17,4%
    expect(compararManualComRota(100, r, 1.15)).toMatchObject({ diferencaMin: -15, grande: false }) // 13%
    expect(compararManualComRota(95, r, 1.15)).toMatchObject({ diferencaMin: -20, grande: true })
  })

  it('só os minutos ou só o percentual não bastam', () => {
    // Trecho curto: 40 min de ônibus. 10 min é 25%, mas menos de 15 min.
    expect(compararManualComRota(50, rota(35), 1.15).grande).toBe(false)
    expect(compararManualComRota(60, rota(35), 1.15)).toMatchObject({ onibusMin: 41, grande: true })
    // Trecho longo: 600 min. 20 min é 3%.
    expect(compararManualComRota(620, rota(522), 1.15).grande).toBe(false)
  })

  it('os limites vêm de config.ts', () => {
    expect(CONFIG.rotaDiferencaGrandeMin).toBe(15)
    expect(CONFIG.rotaDiferencaGrandePct).toBe(15)
  })
})

describe('fase 8: fator ônibus', () => {
  it('fator implícito = roteiro ÷ carro (3h20 e 2h50 → 1,18)', () => {
    expect(fatorImplicito(200, 170)).toBeCloseTo(1.176, 3)
  })

  it('a sugestão é a média dos fatores implícitos dos trechos com roteiro e rota', () => {
    // origem → Monlevade: roteiro 115 min; Monlevade → almoço: roteiro 200 min.
    const plano: DadosPlano = {
      ...PLANO,
      trechos: [
        { etapaOrigemId: 'origem', localOrigemId: 'l-saida', etapaDestinoId: 'monlevade', localDestinoId: 'l-monlevade', duracaoMin: 100, fonte: 'rota', distanciaKm: 90, calculadoEm: CALCULADO },
        { etapaOrigemId: 'monlevade', localOrigemId: 'l-monlevade', etapaDestinoId: 'almoco', localDestinoId: 'l-rest-a', duracaoMin: 160, fonte: 'rota', distanciaKm: 200, calculadoEm: CALCULADO },
      ],
    }
    const s = fatorSugeridoPeloRoteiro(plano)
    expect(s?.trechos).toBe(2)
    expect(s?.fator).toBeCloseTo((1.15 + 1.25) / 2, 10)
  })

  it('não conta trecho sem roteiro, sem rota ou só de alternativa; sem nenhum, não há sugestão', () => {
    expect(fatorSugeridoPeloRoteiro(PLANO)).toBeNull()
    const soAlternativa: DadosPlano = { ...PLANO, trechos: [{ ...PAR, duracaoMin: 160, fonte: 'rota', distanciaKm: 1, calculadoEm: CALCULADO }] }
    expect(fatorSugeridoPeloRoteiro(soAlternativa)).toBeNull()
    const semRoteiro: DadosPlano = { ...PLANO, etapas: ETAPAS.map((e) => ({ ...e, chegadaRoteiro: undefined })), trechos: [{ etapaOrigemId: 'origem', localOrigemId: 'l-saida', etapaDestinoId: 'monlevade', localDestinoId: 'l-monlevade', duracaoMin: 100, fonte: 'rota', distanciaKm: 1, calculadoEm: CALCULADO }] }
    expect(fatorSugeridoPeloRoteiro(semRoteiro)).toBeNull()
  })

  it('a rota ao lado de um trecho manual também conta, se há roteiro', () => {
    const plano: DadosPlano = {
      ...PLANO,
      trechos: [{ etapaOrigemId: 'origem', localOrigemId: 'l-saida', etapaDestinoId: 'monlevade', localDestinoId: 'l-monlevade', duracaoMin: 130, fonte: 'manual', rota: rota(100) }],
    }
    expect(fatorSugeridoPeloRoteiro(plano)?.fator).toBeCloseTo(1.15, 10)
  })

  it('o fator só é aceito de 1,00 a 2,00', () => {
    expect(validarFatorOnibus(1)).toBeNull()
    expect(validarFatorOnibus(1.15)).toBeNull()
    expect(validarFatorOnibus(2)).toBeNull()
    expect(validarFatorOnibus(0.99)).toMatch(/entre 1,00 e 2,00/)
    expect(validarFatorOnibus(2.01)).toMatch(/entre 1,00 e 2,00/)
    expect(validarFatorOnibus(NaN)).toMatch(/Digite/)
  })
})

describe('fase 8: backup com a rota ao lado do manual (formato 1, aditivo)', () => {
  const trechoComRota: Trecho = { ...PAR, duracaoMin: 200, fonte: 'manual', rota: rota(93) }
  const conteudo = (trecho: unknown): ConteudoBackup => ({
    viagens: [{ ...PLANO.viagem, planoOriginal: congelar() }],
    etapas: ETAPAS,
    locais: LOCAIS,
    trechos: [trecho as Trecho],
    eventos: [],
    passageiros: PASSAGEIROS,
    modelos: [],
  })

  it('ida e volta guarda a rota', async () => {
    expect(FORMATO_ATUAL).toBe(1)
    const r = await validarBackup(serializarBackup(await montarBackup(conteudo(trechoComRota), h('10:00'))))
    expect(r.ok && r.backup.conteudo.trechos[0]).toEqual(trechoComRota)
  })

  it('rota malformada ao lado do manual é recusada', async () => {
    const r = await validarBackup(serializarBackup(await montarBackup(conteudo({ ...trechoComRota, rota: { duracaoMin: 'x' } }), h('10:00'))))
    expect(r.ok).toBe(false)
    expect(!r.ok && r.motivo).toMatch(/rota/)
  })
})
