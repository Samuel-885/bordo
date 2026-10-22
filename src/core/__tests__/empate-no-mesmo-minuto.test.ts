// Eventos com o mesmo horário do fato (os horários são arredondados ao minuto e empatam): vale a
// ordem de gravação, não a ordem em que a lista chegou (o banco devolve pela chave do índice).

import { describe, expect, it } from 'vitest'
import { criarEvento } from '../eventos'
import { calcularEstado } from '../previsao'
import { paradaAberta } from '../registro'
import type { ConteudoEvento } from '../eventos'
import { congelar, EVENTOS_CASO_3, h, PLANO } from './fixtures'

const original = congelar()
const base = { viagemId: 'v', horarioFato: h('10:57'), registradoEm: h('10:57') }
const evento = (id: string, sequencia: number | undefined, conteudo: ConteudoEvento, horario = h('10:57')) =>
  criarEvento({ ...base, id, horarioFato: horario, ...(sequencia === undefined ? {} : { sequencia }) }, conteudo)
const trocaPara = (id: string, sequencia: number | undefined, localId: string) =>
  evento(id, sequencia, { tipo: 'troca_local', etapaId: 'almoco', dados: { localId } })
const localDoAlmoco = (eventos: Parameters<typeof calcularEstado>[2]) =>
  calcularEstado(PLANO, original, eventos, h('10:58')).etapas.find((e) => e.etapaId === 'almoco')?.localId

describe('duas trocas de local no mesmo minuto: vale a última gravada', () => {
  // Os ids são escolhidos para que a ordem alfabética (a do banco) seja a inversa da de gravação.
  const primeira = trocaPara('zzz', 100, 'l-rest-c')
  const ultima = trocaPara('aaa', 101, 'l-rest-a')

  it('nas duas ordens em que a lista pode chegar', () => {
    expect(localDoAlmoco([...EVENTOS_CASO_3, primeira, ultima])).toBe('l-rest-a')
    expect(localDoAlmoco([...EVENTOS_CASO_3, ultima, primeira])).toBe('l-rest-a')
  })

  it('invertendo quem foi gravado por último, vale o outro', () => {
    const c = trocaPara('aaa', 101, 'l-rest-c')
    const a = trocaPara('zzz', 100, 'l-rest-a')
    expect(localDoAlmoco([...EVENTOS_CASO_3, a, c])).toBe('l-rest-c')
    expect(localDoAlmoco([...EVENTOS_CASO_3, c, a])).toBe('l-rest-c')
  })

  it('sem sequência, vale a posição na lista (o evento no fim é o último)', () => {
    const x = trocaPara('x', undefined, 'l-rest-c')
    const y = trocaPara('y', undefined, 'l-rest-a')
    expect(localDoAlmoco([...EVENTOS_CASO_3, x, y])).toBe('l-rest-a')
    expect(localDoAlmoco([...EVENTOS_CASO_3, y, x])).toBe('l-rest-c')
  })

  it('o horário continua mandando: a troca mais tarde vale mesmo com sequência menor', () => {
    const tarde = evento('t', 1, { tipo: 'troca_local', etapaId: 'almoco', dados: { localId: 'l-rest-c' } }, h('10:58'))
    const cedo = evento('c', 2, { tipo: 'troca_local', etapaId: 'almoco', dados: { localId: 'l-rest-a' } }, h('10:57'))
    expect(localDoAlmoco([...EVENTOS_CASO_3, cedo, tarde])).toBe('l-rest-c')
    expect(localDoAlmoco([...EVENTOS_CASO_3, tarde, cedo])).toBe('l-rest-c')
  })
})

describe('o mesmo desempate vale para os outros eventos do mesmo minuto', () => {
  it('duas recalibrações no mesmo minuto: vale a última gravada, em qualquer ordem da lista', () => {
    const r1 = evento('zzz', 100, { tipo: 'recalibracao', etapaId: 'almoco', dados: { horario: h('13:00') } })
    const r2 = evento('aaa', 101, { tipo: 'recalibracao', etapaId: 'almoco', dados: { horario: h('13:30') } })
    for (const lista of [[r1, r2], [r2, r1]]) {
      const e = calcularEstado(PLANO, original, [...EVENTOS_CASO_3, ...lista], h('10:58'))
      expect(e.etapas.find((x) => x.etapaId === 'almoco')?.chegada?.instante).toBe(h('13:30'))
    }
  })

  it('PARAMOS e VOLTAMOS no mesmo minuto: a parada fecha na ordem de gravação', () => {
    const inicio = evento('zzz', 100, { tipo: 'parada_nao_planejada', etapaId: 'almoco', dados: { fase: 'inicio' } })
    const fim = evento('aaa', 101, { tipo: 'parada_nao_planejada', etapaId: 'almoco', dados: { fase: 'fim' } })
    for (const lista of [[inicio, fim], [fim, inicio]]) {
      expect(paradaAberta([...EVENTOS_CASO_3, ...lista], 'almoco')).toBeNull()
    }
  })
})
