// Cada cenário roda do início ao fim, e o estado final é conferido pelo núcleo.
// Os valores dos cenários que reproduzem casos da especificação são os do caso;
// os demais foram calculados à mão (conta no comentário de cada teste).

import { afterEach, describe, expect, it } from 'vitest'
import { contagemRapida, esperadosNaSaida } from '../../core/passageiros'
import { pendenciasDeRegistro } from '../../core/previsao'
import { agora, simuladoAtivo } from '../../core/relogio'
import { diferencaMin } from '../../core/tempo'
import { avaliarAlternativas } from '../../core/viabilidade'
import { CENARIOS, cenarioPorId, idPassageiroDemo } from '../cenarios'
import { ETAPA, horaDemo, LOCAL } from '../dados'
import { SessaoDemo } from '../executor'
import { esperarHorario, etapaDe } from './ajudas'

let sessao: SessaoDemo | null = null

function rodar(id: string): SessaoDemo {
  sessao = new SessaoDemo(cenarioPorId(id))
  sessao.executarTudo()
  return sessao
}

afterEach(() => {
  sessao?.encerrar()
  sessao = null
})

describe('cenário: saída atrasada (caso 1)', () => {
  it('Monlevade 08:42, almoço 12:17, destino 23:47, atraso +17', () => {
    const e = rodar('saida-atrasada').estado()
    esperarHorario(etapaDe(e, ETAPA.origem).saida?.instante, horaDemo('06:47'))
    esperarHorario(etapaDe(e, ETAPA.monlevade).chegada?.instante, horaDemo('08:42'))
    esperarHorario(etapaDe(e, ETAPA.almoco).chegada?.instante, horaDemo('12:17'))
    esperarHorario(e.chegadaDestino?.instante, horaDemo('23:47'))
    expect(e.atrasoDestinoMin).toBe(17)
    expect(e.emTransito).toBe(true)
  })
})

describe('cenário: chegada atrasada em Monlevade (caso 2)', () => {
  it('saída prevista 09:10, almoço 12:30, destino 00:00 do dia seguinte, atraso +30', () => {
    const e = rodar('chegada-atrasada-monlevade').estado()
    const monlevade = etapaDe(e, ETAPA.monlevade)
    expect(monlevade.estado).toBe('em_parada')
    esperarHorario(monlevade.chegada?.instante, horaDemo('08:55'))
    esperarHorario(monlevade.saida?.instante, horaDemo('09:10'))
    esperarHorario(etapaDe(e, ETAPA.almoco).chegada?.instante, horaDemo('12:30'))
    esperarHorario(e.chegadaDestino?.instante, horaDemo('00:00', 1))
    expect(e.atrasoDestinoMin).toBe(30)
  })
})

describe('cenário: passageiro faltando', () => {
  // Saída 06:30, Monlevade 08:25 e saída 08:40, tudo no horário: atraso 0.
  // Esperados: 35 na saída de Ipatinga; 38 na de Monlevade, e 37 depois do "não embarcou".
  it('com a contagem de 37 para 38 esperados, mostra a diferença de 1', () => {
    const s = new SessaoDemo(cenarioPorId('passageiro-faltando'))
    sessao = s
    s.executarAte(4)
    expect(esperadosNaSaida(ETAPA.monlevade, s.dados.etapas, s.passageiros, s.eventos)).toBe(38)
    expect(contagemRapida(38, 37)).toEqual({ completa: false, diferenca: 1, sentido: 'faltando' })
  })

  it('marca o passageiro 38 como "não embarcou" e a contagem de 37 passa a bater', () => {
    const s = rodar('passageiro-faltando')
    expect(esperadosNaSaida(ETAPA.origem, s.dados.etapas, s.passageiros, s.eventos)).toBe(35)
    expect(esperadosNaSaida(ETAPA.monlevade, s.dados.etapas, s.passageiros, s.eventos)).toBe(37)
    expect(contagemRapida(37, 37)).toEqual({ completa: true, resultado: 'completa_por_contagem' })

    const mudancas = s.eventos.filter((ev) => ev.tipo === 'status_passageiro')
    expect(mudancas).toHaveLength(1)
    expect(mudancas[0]).toMatchObject({
      etapaId: ETAPA.monlevade,
      dados: { passageiroId: idPassageiroDemo(38), status: 'nao_embarcou' },
    })
    expect(mudancas[0]!.dados.motivo).toBeTruthy()
  })

  it('não muda a previsão: tudo no horário', () => {
    const e = rodar('passageiro-faltando').estado()
    expect(etapaDe(e, ETAPA.monlevade).estado).toBe('concluida')
    esperarHorario(e.chegadaDestino?.instante, horaDemo('23:30'))
    expect(e.atrasoDestinoMin).toBe(0)
  })
})

describe('cenário: parada estourando o tempo (caso 4)', () => {
  it('às 09:20, sem saída: saída prevista 09:20, destino 00:10, atraso +40', () => {
    const e = rodar('parada-estourando').estado()
    const monlevade = etapaDe(e, ETAPA.monlevade)
    expect(monlevade.estado).toBe('em_parada')
    esperarHorario(monlevade.saida?.instante, horaDemo('09:20'))
    expect(monlevade.saida?.origem).toBe('relogio')
    esperarHorario(e.chegadaDestino?.instante, horaDemo('00:10', 1))
    expect(e.atrasoDestinoMin).toBe(40)
  })
})

describe('cenário: restaurante inviável e troca (caso 9)', () => {
  // Saída de Monlevade às 10:55. A: 10:55 + 3h20 = 14:15, fecha 14:00 (inviável).
  // B: + 3h40 = 14:35, termina 15:35, fecha 15:00 (margem −35: pouca margem).
  // C: + 4h10 = 15:05, termina 16:05, fecha 16:30 (margem 25: viável).
  it('às 10:55: A inviável, B pouca margem, C viável com 25 min de margem', () => {
    const s = new SessaoDemo(cenarioPorId('restaurante-inviavel-e-troca'))
    sessao = s
    s.executarAte(8)
    expect(diferencaMin(agora(), horaDemo('10:55'))).toBe(0)
    const lista = avaliarAlternativas(s.dados, s.original, s.eventos, agora(), ETAPA.almoco)
    const por = (id: string) => lista.find((a) => a.localId === id)!

    expect(por(LOCAL.restA)).toMatchObject({ classe: 'inviavel', escolhida: true })
    esperarHorario(por(LOCAL.restA).chegada, horaDemo('14:15'))
    expect(por(LOCAL.restB)).toMatchObject({ classe: 'pouca_margem', margemMin: -35, impactoDestinoMin: 20 })
    esperarHorario(por(LOCAL.restB).chegada, horaDemo('14:35'))
    expect(por(LOCAL.restC)).toMatchObject({ classe: 'viavel', margemMin: 25, impactoDestinoMin: 50 })
    esperarHorario(por(LOCAL.restC).chegada, horaDemo('15:05'))
    expect(lista.map((a) => a.localId)).toEqual([LOCAL.restC, LOCAL.restB, LOCAL.restA])
  })

  // Depois da troca: almoço 15:05–16:05; café 16:05 + 3h = 19:05, saída 19:35;
  // jantar 19:35 + 4h = 23:35, saída 00:25; destino 00:25 + 2h10 = 02:35.
  // Atraso: 02:35 − 23:30 = 3h05 = +185.
  it('depois da troca para o C: almoço 15:05, destino 02:35 do dia seguinte, atraso +185', () => {
    const s = rodar('restaurante-inviavel-e-troca')
    const e = s.estado()
    const almoco = etapaDe(e, ETAPA.almoco)
    expect(almoco.localId).toBe(LOCAL.restC)
    esperarHorario(almoco.chegada?.instante, horaDemo('15:05'))
    esperarHorario(almoco.saida?.instante, horaDemo('16:05'))
    esperarHorario(etapaDe(e, ETAPA.cafe).chegada?.instante, horaDemo('19:05'))
    esperarHorario(etapaDe(e, ETAPA.jantar).chegada?.instante, horaDemo('23:35'))
    esperarHorario(e.chegadaDestino?.instante, horaDemo('02:35', 1))
    expect(e.atrasoDestinoMin).toBe(185)
    expect(s.eventos.some((ev) => ev.tipo === 'imprevisto' && ev.dados.categoria === 'problema_mecanico')).toBe(true)
  })

  it('o plano original continua com o almoço no Restaurante A', () => {
    const s = rodar('restaurante-inviavel-e-troca')
    expect(s.original.etapas.find((o) => o.etapaId === ETAPA.almoco)?.localId).toBe(LOCAL.restA)
  })
})

describe('cenário: recalibração pelo Google Maps (caso 6)', () => {
  it('almoço 13:02, informado às 11:40; destino 00:32, atraso +62', () => {
    const e = rodar('recalibracao-google-maps').estado()
    const almoco = etapaDe(e, ETAPA.almoco)
    esperarHorario(almoco.chegada?.instante, horaDemo('13:02'))
    expect(almoco.chegada?.origem).toBe('recalibracao')
    esperarHorario(almoco.chegada?.recalibradoEm, horaDemo('11:40'))
    esperarHorario(e.chegadaDestino?.instante, horaDemo('00:32', 1))
    expect(e.atrasoDestinoMin).toBe(62)
  })
})

describe('cenário: parada não planejada (caso 8)', () => {
  // Saída de Monlevade 09:14 + 3h20 = 12:34. Parados das 11:00 às 11:20: 12:54.
  it('enquanto dura (11:15) a previsão do almoço é 12:49, contando o tempo até agora', () => {
    const s = new SessaoDemo(cenarioPorId('parada-nao-planejada'))
    sessao = s
    s.executarAte(9)
    expect(diferencaMin(agora(), horaDemo('11:15'))).toBe(0)
    esperarHorario(etapaDe(s.estado(), ETAPA.almoco).chegada?.instante, horaDemo('12:49'))
  })

  it('depois dos 20 min: almoço 12:54, destino 00:24, atraso +54', () => {
    const e = rodar('parada-nao-planejada').estado()
    esperarHorario(etapaDe(e, ETAPA.almoco).chegada?.instante, horaDemo('12:54'))
    esperarHorario(e.chegadaDestino?.instante, horaDemo('00:24', 1))
    expect(e.atrasoDestinoMin).toBe(54)
  })
})

describe('cenário: parada para café (tempo previsto de 20 min)', () => {
  // Saída de Monlevade 09:14 + 3h20 = 12:34. Parados das 10:00 com 20 min previstos: 12:54 já ao parar.
  it('ao parar (10:00) o almoço já está em 12:54, destino 00:24', () => {
    const s = new SessaoDemo(cenarioPorId('parada-para-cafe'))
    sessao = s
    s.executarAte(8)
    esperarHorario(etapaDe(s.estado(), ETAPA.almoco).chegada?.instante, horaDemo('12:54'))
    esperarHorario(s.estado().chegadaDestino?.instante, horaDemo('00:24', 1))
  })

  it('aos 10:15 continua 12:54; aos 10:30 (excedeu 10 min) acompanha o relógio: 13:04', () => {
    const s = new SessaoDemo(cenarioPorId('parada-para-cafe'))
    sessao = s
    s.executarAte(9)
    esperarHorario(etapaDe(s.estado(), ETAPA.almoco).chegada?.instante, horaDemo('12:54'))
    s.executarAte(10)
    esperarHorario(etapaDe(s.estado(), ETAPA.almoco).chegada?.instante, horaDemo('13:04'))
  })

  it('depois do VOLTAMOS vale a duração real (30 min): almoço 13:04, destino 00:34, atraso +64', () => {
    const e = rodar('parada-para-cafe').estado()
    esperarHorario(etapaDe(e, ETAPA.almoco).chegada?.instante, horaDemo('13:04'))
    esperarHorario(e.chegadaDestino?.instante, horaDemo('00:34', 1))
    expect(e.atrasoDestinoMin).toBe(64)
  })
})

describe('cenário: chegada ao destino', () => {
  // 17 min de atraso o tempo todo: 06:47 + 1h55 = 08:42; 08:57 + 3h20 = 12:17;
  // 13:17 + 3h = 16:17; 16:47 + 4h = 20:47; 21:37 + 2h10 = 23:47.
  it('chega às 23:47, atraso +17, viagem concluída e nada pendente', () => {
    const s = rodar('chegada-ao-destino')
    const e = s.estado()
    const destino = etapaDe(e, ETAPA.destino)
    expect(destino.estado).toBe('concluida')
    expect(destino.chegada?.origem).toBe('real')
    esperarHorario(destino.chegada?.instante, horaDemo('23:47'))
    expect(e.atrasoDestinoMin).toBe(17)
    expect(e.emTransito).toBe(false)
    expect(e.proximaEtapaId).toBeNull()
    expect(e.etapas.every((x) => x.estado === 'concluida')).toBe(true)
    expect(pendenciasDeRegistro(s.dados, s.eventos)).toEqual([])
    expect(s.eventos.at(-1)?.tipo).toBe('fim')
  })
})

describe.each(CENARIOS)('cenário $id', (cenario) => {
  it('é reproduzível: duas execuções dão os mesmos eventos e o mesmo estado', () => {
    const a = new SessaoDemo(cenario)
    a.executarTudo()
    const eventosA = structuredClone(a.eventos)
    const estadoA = a.estado()
    a.encerrar()

    const b = new SessaoDemo(cenario)
    sessao = b
    b.executarTudo()
    expect(b.eventos).toEqual(eventosA)
    expect(b.estado()).toEqual(estadoA)
  })

  it('mantém o plano original intacto do início ao fim (caso 15)', () => {
    const s = new SessaoDemo(cenario)
    sessao = s
    const inicial = structuredClone(s.original)
    while (s.avancarPasso()) expect(s.original).toEqual(inicial)
    expect(s.original).toEqual(inicial)
  })

  it('reinicia: volta ao relógio, plano e eventos do início', () => {
    const s = new SessaoDemo(cenario)
    sessao = s
    const eventosIniciais = structuredClone(s.eventos)
    s.executarTudo()
    s.reiniciar()
    expect(s.passo).toBe(0)
    expect(s.modoLivre).toBe(false)
    expect(s.eventos).toEqual(eventosIniciais)
    expect(s.eventos).toHaveLength(1)
    expect(agora()).toBe(cenario.inicio)
  })

  it('começa com a viagem iniciada e o relógio simulado ligado', () => {
    const s = new SessaoDemo(cenario)
    sessao = s
    expect(simuladoAtivo()).toBe(true)
    expect(s.eventos.map((ev) => ev.tipo)).toEqual(['inicio'])
    expect(s.passo).toBe(0)
    expect(s.totalPassos).toBeGreaterThan(0)
  })

  it('só usa ids da demonstração nos eventos', () => {
    const s = new SessaoDemo(cenario)
    sessao = s
    s.executarTudo()
    expect(s.eventos.every((ev) => ev.id.startsWith('demo-') && ev.viagemId.startsWith('demo-'))).toBe(true)
  })
})
