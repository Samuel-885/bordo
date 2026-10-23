// Rotas calculadas e busca de endereço (fase 8): só lógica pura. As chamadas de rede ficam em
// `src/servicos/`; aqui estão a leitura das respostas, a escolha dos pares a calcular e as regras
// de convivência entre rota, roteiro e tempo manual.

import { CONFIG } from './config'
import { aplicarFatorOnibus, duracaoTrecho, type ParDeTrecho } from './trechos'
import { paresVizinhos } from './ordem'
import type { DadosPlano, Etapa, Instante, RotaDoTrecho, Trecho } from './tipos'

// ---------- Resposta do serviço de rotas (OSRM) ----------

/** Falhas do serviço em si (rede, limite, servidor), que interrompem um lote de cálculos. */
export type ErroDeServico = 'sem_internet' | 'tempo_esgotado' | 'limite' | 'fora'

export interface RotaCalculada {
  /** Tempo de carro em minutos inteiros, arredondado para cima. */
  minutosCarro: number
  distanciaKm: number
}

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** O OSRM responde que não há caminho entre os pontos com estes códigos. */
export function respostaSemCaminho(json: unknown): boolean {
  return ehObjeto(json) && (json.code === 'NoRoute' || json.code === 'NoSegment')
}

/**
 * Tempo de carro e distância da primeira rota da resposta. `null` quando a resposta não traz
 * rota utilizável: código diferente de "Ok", lista vazia, duração ou distância que não são
 * números, ou duração zero. Nunca inventa valor.
 */
export function interpretarRotaOsrm(json: unknown): RotaCalculada | null {
  if (!ehObjeto(json) || json.code !== 'Ok' || !Array.isArray(json.routes)) return null
  const rota = json.routes[0]
  if (!ehObjeto(rota)) return null
  const { duration, distance } = rota
  if (typeof duration !== 'number' || typeof distance !== 'number') return null
  if (!Number.isFinite(duration) || !Number.isFinite(distance) || duration <= 0 || distance < 0) return null
  // Arredonda antes do ceil para que erro de ponto flutuante não ganhe um minuto a mais.
  const minutosCarro = Math.ceil(Math.round((duration / 60) * 1e6) / 1e6)
  return { minutosCarro, distanciaKm: Math.round(distance / 100) / 10 }
}

// ---------- Resposta da busca de endereço (Photon) ----------

export interface ResultadoDeBusca {
  nome: string
  /** Cidade (ou, na falta, município ou bairro): o usuário pode editar depois. */
  cidade: string
  estado: string
  lat: number
  lng: number
}

const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** Até `limite` resultados válidos do Photon. Descarta o que não tem nome ou coordenadas válidas. */
export function interpretarBuscaPhoton(json: unknown, limite: number = CONFIG.buscaMaxResultados): ResultadoDeBusca[] {
  if (!ehObjeto(json) || !Array.isArray(json.features)) return []
  const resultados: ResultadoDeBusca[] = []
  for (const f of json.features) {
    if (resultados.length >= limite) break
    if (!ehObjeto(f) || !ehObjeto(f.properties) || !ehObjeto(f.geometry)) continue
    const coord = f.geometry.coordinates
    if (!Array.isArray(coord) || typeof coord[0] !== 'number' || typeof coord[1] !== 'number') continue
    // O GeoJSON vem como [longitude, latitude].
    const [lng, lat] = coord as [number, number]
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue
    const p = f.properties
    const rua = [texto(p.street), texto(p.housenumber)].filter(Boolean).join(' ')
    const nome = texto(p.name) || rua
    if (!nome) continue
    const cidade = texto(p.city) || (p.type === 'city' ? texto(p.name) : '') || texto(p.county) || texto(p.district)
    resultados.push({ nome, cidade, estado: texto(p.state), lat, lng })
  }
  return resultados
}

// ---------- Quais trechos calcular ----------

const mesmoPar = (t: ParDeTrecho, par: ParDeTrecho) =>
  t.etapaOrigemId === par.etapaOrigemId &&
  t.localOrigemId === par.localOrigemId &&
  t.etapaDestinoId === par.etapaDestinoId &&
  t.localDestinoId === par.localDestinoId

export const trechoDoPar = (d: DadosPlano, par: ParDeTrecho): Trecho | undefined => d.trechos.find((t) => mesmoPar(t, par))

export interface Ponto {
  lat: number
  lng: number
}

export interface ParaCalcular {
  par: ParDeTrecho
  de: Ponto
  ate: Ponto
}

export interface ParesDaRota {
  calcular: ParaCalcular[]
  /** Pares em que um dos locais não tem coordenadas: ficam como estão. */
  semCoordenadas: ParDeTrecho[]
}

const candidatos = (e: Etapa): string[] => [...new Set([e.localId, ...e.alternativas])].filter((id): id is string => id !== null)

/**
 * Todos os pares de locais candidatos de etapas vizinhas (inclusive preferido → preferido, e os
 * que já têm tempo de roteiro, para a rota servir de calibração). Pares de um local com ele mesmo
 * não têm o que calcular.
 */
export function paresParaCalcular(d: DadosPlano): ParesDaRota {
  const ponto = (id: string): Ponto | null => d.locais.find((l) => l.id === id)?.coordenadas ?? null
  const calcular: ParaCalcular[] = []
  const semCoordenadas: ParDeTrecho[] = []
  for (const [a, b] of paresVizinhos(d.etapas)) {
    for (const localA of candidatos(a)) {
      for (const localB of candidatos(b)) {
        if (localA === localB) continue
        const par = { etapaOrigemId: a.id, localOrigemId: localA, etapaDestinoId: b.id, localDestinoId: localB }
        const de = ponto(localA)
        const ate = ponto(localB)
        if (de && ate) calcular.push({ par, de, ate })
        else semCoordenadas.push(par)
      }
    }
  }
  return { calcular, semCoordenadas }
}

/** Locais (sem repetir) que impedem algum par de ser calculado por falta de coordenadas. */
export function locaisSemCoordenadas(d: DadosPlano, pares: readonly ParDeTrecho[]): string[] {
  const sem = (id: string) => !d.locais.find((l) => l.id === id)?.coordenadas
  const ids = pares.flatMap((p) => [p.localOrigemId, p.localDestinoId]).filter(sem)
  return [...new Set(ids)]
}

// ---------- Guardar o resultado sem pisar no manual ----------

/**
 * O trecho depois de um cálculo de rota. Trecho manual nunca é sobrescrito: a rota fica ao lado,
 * no campo `rota`, e o cálculo continua usando o manual. Sem trecho, ou com trecho de rota, a rota
 * (nova) vira o trecho.
 */
export function aplicarRota(existente: Trecho | undefined, par: ParDeTrecho, rota: RotaCalculada, calculadoEm: Instante): Trecho {
  const guardada: RotaDoTrecho = { duracaoMin: rota.minutosCarro, distanciaKm: rota.distanciaKm, calculadoEm }
  if (existente?.fonte === 'manual') return { ...existente, rota: guardada }
  return { ...par, duracaoMin: guardada.duracaoMin, fonte: 'rota', distanciaKm: guardada.distanciaKm, calculadoEm }
}

/** A rota guardada de um trecho (própria, na fonte rota; ou ao lado do manual). */
export function rotaDoTrecho(t: Trecho | undefined): RotaDoTrecho | null {
  if (!t) return null
  if (t.fonte === 'manual') return t.rota ?? null
  if (t.duracaoMin === null || t.distanciaKm === undefined || t.calculadoEm === undefined) return null
  return { duracaoMin: t.duracaoMin, distanciaKm: t.distanciaKm, calculadoEm: t.calculadoEm }
}

/**
 * Guarda a rota que já estava ao lado do manual quando o trecho de rota passa a ser digitado:
 * a rota calculada não se perde.
 */
export function trechoManualComRota(existente: Trecho | undefined, par: ParDeTrecho, duracaoMin: number): Trecho {
  const rota = rotaDoTrecho(existente)
  return { ...par, duracaoMin, fonte: 'manual', ...(rota ? { rota } : {}) }
}

/** "Usar a rota": a rota guardada vira o trecho, e o tempo digitado deixa de existir. */
export function usarRotaNoLugarDoManual(t: Trecho): Trecho | null {
  if (t.fonte !== 'manual' || !t.rota) return null
  const { duracaoMin, distanciaKm, calculadoEm } = t.rota
  return {
    etapaOrigemId: t.etapaOrigemId,
    localOrigemId: t.localOrigemId,
    etapaDestinoId: t.etapaDestinoId,
    localDestinoId: t.localDestinoId,
    duracaoMin,
    fonte: 'rota',
    distanciaKm,
    calculadoEm,
  }
}

/** "Manter o meu": o manual fica e a rota guardada ao lado é descartada. */
export function manterManual(t: Trecho): Trecho {
  const { rota: _descartada, ...resto } = t
  return resto
}

// ---------- Manual × rota ----------

/** Rota × fator ônibus, a duração que o cálculo usaria se não houvesse o manual. */
export function minutosDeOnibusDaRota(rota: RotaDoTrecho, fator: number): number {
  return aplicarFatorOnibus(rota.duracaoMin, fator)
}

export interface ComparacaoManualRota {
  manualMin: number
  carroMin: number
  onibusMin: number
  /** Manual − rota × fator (negativo = manual menor). */
  diferencaMin: number
  grande: boolean
}

/**
 * Compara o tempo manual com a rota × fator ônibus. "Grande" = 15 min ou mais E 15% ou mais da rota × fator
 * (limites em `config.ts`).
 */
export function compararManualComRota(manualMin: number, rota: RotaDoTrecho, fator: number): ComparacaoManualRota {
  const onibusMin = minutosDeOnibusDaRota(rota, fator)
  const diferenca = manualMin - onibusMin
  const absoluta = Math.abs(diferenca)
  const grande =
    absoluta >= CONFIG.rotaDiferencaGrandeMin && absoluta * 100 >= CONFIG.rotaDiferencaGrandePct * onibusMin
  return { manualMin, carroMin: rota.duracaoMin, onibusMin, diferencaMin: diferenca, grande }
}

// ---------- Fator ônibus ----------

/** Tempo do roteiro ÷ tempo de carro. */
export function fatorImplicito(roteiroMin: number, carroMin: number): number {
  return roteiroMin / carroMin
}

export interface FatorSugerido {
  /** Média dos fatores implícitos (sem arredondar). */
  fator: number
  trechos: number
}

/**
 * Média dos fatores implícitos dos trechos que têm tempo de roteiro e rota calculada. É só uma
 * sugestão para calibrar: nunca é aplicada sozinha.
 */
export function fatorSugeridoPeloRoteiro(d: DadosPlano): FatorSugerido | null {
  const fatores: number[] = []
  for (const [a, b] of paresVizinhos(d.etapas)) {
    if (a.localId === null || b.localId === null) continue
    const roteiro = duracaoTrecho(d, a, a.localId, b, b.localId)
    if (roteiro.fonte !== 'roteiro' || roteiro.minutos === null || roteiro.minutos <= 0) continue
    const par = { etapaOrigemId: a.id, localOrigemId: a.localId, etapaDestinoId: b.id, localDestinoId: b.localId }
    const rota = rotaDoTrecho(trechoDoPar(d, par))
    if (rota && rota.duracaoMin > 0) fatores.push(fatorImplicito(roteiro.minutos, rota.duracaoMin))
  }
  if (fatores.length === 0) return null
  return { fator: fatores.reduce((soma, f) => soma + f, 0) / fatores.length, trechos: fatores.length }
}

/** Mensagem de erro, ou `null` se o fator é aceito (entre os limites de `config.ts`). */
export function validarFatorOnibus(fator: number): string | null {
  if (!Number.isFinite(fator)) return 'Digite o fator ônibus, por exemplo 1,15.'
  if (fator < CONFIG.fatorOnibusMin || fator > CONFIG.fatorOnibusMax) {
    return `O fator ônibus precisa ficar entre ${CONFIG.fatorOnibusMin.toFixed(2).replace('.', ',')} e ${CONFIG.fatorOnibusMax.toFixed(2).replace('.', ',')}.`
  }
  return null
}
