// Relatório da viagem (fase 10b). Casos R1 a R14 da seção "Decisões da fase 10b" da especificação.
// Partem do plano dos casos de teste do recálculo; nomes de locais e passageiros são fictícios.

import { describe, expect, it } from 'vitest'
import { montarRelatorio, OPCOES_PADRAO, type LinhaDeAtraso, type Relatorio } from '../relatorio'
import type { DadosPlano, Evento, RestauradoDe, StatusViagem, Trecho } from '../tipos'
import { congelar, ev, EVENTOS_CASO_3, h, PASSAGEIROS, PLANO } from './fixtures'

const original = congelar()

function planoCom(status: StatusViagem = 'concluida', extra: Partial<DadosPlano> = {}): DadosPlano {
  return { ...PLANO, ...extra, viagem: { ...PLANO.viagem, status, planoOriginal: original, identificacao: 'Unidade fictícia — Ipatinga', equipe: 2 } }
}

/** Viagem inteira: saída 06:47, Monlevade 08:55–09:14, almoço 12:40–13:30, café 16:20–16:55, jantar 21:00–21:50, destino 00:30. */
function viagemCompleta(): Evento[] {
  return [
    ...EVENTOS_CASO_3,
    ev.chegada('almoco', h('12:40')),
    ev.saida('almoco', h('13:30')),
    ev.chegada('cafe', h('16:20')),
    ev.saida('cafe', h('16:55')),
    ev.chegada('jantar', h('21:00')),
    ev.saida('jantar', h('21:50')),
    ev.chegada('destino', h('00:30', 1)),
    ev.fim(h('00:30', 1)),
  ]
}

function relatorio(eventos: Evento[], opcoes = OPCOES_PADRAO, status: StatusViagem = 'concluida', agora = h('01:00', 1), restaurado: RestauradoDe | null = null, plano = planoCom(status)): Relatorio {
  return montarRelatorio(plano, eventos, PASSAGEIROS, agora, restaurado, opcoes)
}
const linha = (r: Relatorio, etapaId: string): LinhaDeAtraso => r.atraso.find((l) => l.etapaId === etapaId)!

describe('R1: variação por etapa (o atraso nunca é somado)', () => {
  const r = relatorio(EVENTOS_CASO_3, OPCOES_PADRAO, 'em_andamento', h('09:20'))
  it('saída de Ipatinga +17; chegada em Monlevade +30 (variação +13); saída +34 (variação +4)', () => {
    expect(linha(r, 'origem').saida).toMatchObject({ atrasoMin: 17, variacaoMin: 17 })
    expect(linha(r, 'monlevade').chegada).toMatchObject({ atrasoMin: 30, variacaoMin: 13 })
    expect(linha(r, 'monlevade').saida).toMatchObject({ atrasoMin: 34, variacaoMin: 4 })
  })
  it('o que ainda não aconteceu fica sem real e sem variação', () => {
    expect(linha(r, 'almoco').chegada).toMatchObject({ real: null, atrasoMin: null, variacaoMin: null })
  })
})

describe('R2: variação negativa quando o atraso diminui', () => {
  it('chegada no almoço 12:10 (+10) depois de sair de Monlevade com +34: variação −24', () => {
    const r = relatorio([...EVENTOS_CASO_3, ev.chegada('almoco', h('12:10'))], OPCOES_PADRAO, 'em_andamento', h('12:20'))
    expect(linha(r, 'almoco').chegada).toMatchObject({ atrasoMin: 10, variacaoMin: -24 })
  })
})

describe('R3: viagem concluída, a soma das variações fecha no atraso final', () => {
  const r = relatorio(viagemCompleta())
  it('+60 no destino e variações 17, 13, 4, 6, −10, −10, 5, 5, 0, 30', () => {
    expect(r.resumo.atrasoFinalMin).toBe(60)
    const variacoes = r.atraso.flatMap((l) => [l.chegada?.variacaoMin, l.saida?.variacaoMin]).filter((v): v is number => typeof v === 'number')
    expect(variacoes).toEqual([17, 13, 4, 6, -10, -10, 5, 5, 0, 30])
    expect(variacoes.reduce((a, b) => a + b, 0)).toBe(60)
  })
  it('resumo: saída e chegada original × real, duração total e sem aviso de andamento', () => {
    expect(r.emAndamento).toBe(false)
    expect(r.resumo).toMatchObject({ saidaOriginal: h('06:30'), saidaReal: h('06:47'), chegadaOriginal: h('23:30'), chegadaReal: h('00:30', 1), duracaoTotalMin: 17 * 60 + 43, duracaoParcial: false, chegadaPrevista: null })
  })
  it('cabeçalho: nome, tipo, data, identificação, equipe e status', () => {
    expect(r).toMatchObject({ nome: 'Viagem de teste', tipo: 'ida', identificacao: 'Unidade fictícia — Ipatinga', equipe: 2, status: 'concluida' })
  })
})

describe('R4: parada incluída em viagem', () => {
  // Depois de Monlevade (saída 09:10): 30 min até a parada, 40 min nela, 3h00 até o almoço (13:20).
  const trechos: Trecho[] = [
    { etapaOrigemId: 'monlevade', localOrigemId: 'l-monlevade', etapaDestinoId: 'x-par', localDestinoId: 'l-cafe', duracaoMin: 30, fonte: 'manual' },
    { etapaOrigemId: 'x-par', localOrigemId: 'l-cafe', etapaDestinoId: 'almoco', localDestinoId: 'l-rest-a', duracaoMin: 180, fonte: 'manual' },
  ]
  const eventos = (): Evento[] => [
    ev.inicio(h('06:00')),
    ev.saida('origem', h('06:47')),
    ev.chegada('monlevade', h('08:55')),
    ev.saida('monlevade', h('09:10')),
    ev.incluirParada('x-par', { apos: 'monlevade', localId: 'l-cafe', categoria: 'visita', motivo: 'Mirante', permanenciaMin: 40, trechos }, h('09:12')),
    ev.chegada('x-par', h('09:40')),
    ev.saida('x-par', h('10:20')),
    ev.chegada('almoco', h('13:20')),
  ]
  const r = relatorio(eventos(), OPCOES_PADRAO, 'em_andamento', h('13:30'))

  it('marcada "incluída", sem original e sem atraso próprio', () => {
    const x = linha(r, 'x-par')
    expect(x).toMatchObject({ incluida: true, motivo: 'Mirante', categoria: 'visita' })
    expect(x.chegada).toMatchObject({ original: null, real: h('09:40'), atrasoMin: null, variacaoMin: null })
    expect(x.saida).toMatchObject({ original: null, atrasoMin: null })
  })
  it('a permanência inteira (40 min) é variação; o trecho até ela fica sem variação', () => {
    expect(linha(r, 'x-par').saida?.variacaoMin).toBe(40)
  })
  it('o trecho seguinte leva a diferença: (30 + 180) − 200 do roteiro = +10', () => {
    expect(linha(r, 'almoco').chegada).toMatchObject({ atrasoMin: 80, variacaoMin: 10 })
  })
  it('a soma das variações (a da parada incluída com a permanência) fecha no atraso do último marco', () => {
    const soma = r.atraso.flatMap((l) => [l.chegada?.variacaoMin, l.saida?.variacaoMin]).filter((v): v is number => typeof v === 'number').reduce((a, b) => a + b, 0)
    expect(soma).toBe(80)
  })
  it('duas incluídas em sequência: ainda fecha', () => {
    const duas = [
      ...eventos().slice(0, 7),
      ev.incluirParada('y-par', { apos: 'x-par', localId: 'l-cafe', categoria: 'cafe', permanenciaMin: 10, trechos: [] }, h('10:21')),
      ev.chegada('y-par', h('10:40')),
      ev.saida('y-par', h('10:55')),
      ev.chegada('almoco', h('13:40')),
    ]
    const rr = relatorio(duas, OPCOES_PADRAO, 'em_andamento', h('13:50'))
    const soma = rr.atraso.flatMap((l) => [l.chegada?.variacaoMin, l.saida?.variacaoMin]).filter((v): v is number => typeof v === 'number').reduce((a, b) => a + b, 0)
    expect(soma).toBe(100)
  })
  it('entra na permanência com a permanência informada na inclusão como planejada', () => {
    expect(r.permanencias.linhas.find((l) => l.etapaId === 'x-par')).toMatchObject({ incluida: true, planejadoMin: 40, realMin: 40, diferencaMin: 0, situacao: 'completa' })
  })
  it('mudança de roteiro nas ocorrências, e a inclusão cancelada', () => {
    expect(r.ocorrencias).toContainEqual(expect.objectContaining({ tipo: 'parada_incluida', etapaId: 'x-par', motivo: 'Mirante', permanenciaMin: 40 }))
    const base = eventos().slice(0, 5)
    const cancelada = [...base, ev.cancelarInclusao('x-par', base[4]!.id, h('09:13'))]
    const rc = relatorio(cancelada, OPCOES_PADRAO, 'em_andamento', h('09:20'))
    expect(rc.ocorrencias.map((o) => o.tipo)).toEqual(['parada_incluida', 'inclusao_cancelada'])
    expect(rc.atraso.some((l) => l.incluida)).toBe(false)
  })
})

describe('R5: etapa pulada e local trocado', () => {
  const r = relatorio([...EVENTOS_CASO_3, ev.troca('almoco', 'l-rest-b', h('09:30')), ev.pular('cafe', h('09:31'))], OPCOES_PADRAO, 'em_andamento', h('09:40'))
  it('indicados na linha da etapa e nas ocorrências', () => {
    expect(linha(r, 'cafe')).toMatchObject({ pulada: true, chegada: null, saida: null })
    expect(linha(r, 'almoco')).toMatchObject({ localTrocado: true, localPlanejadoId: 'l-rest-a', localRealId: 'l-rest-b' })
    expect(r.ocorrencias).toEqual([
      expect.objectContaining({ tipo: 'troca_local', etapaId: 'almoco', deLocalId: 'l-rest-a', paraLocalId: 'l-rest-b' }),
      expect.objectContaining({ tipo: 'etapa_pulada', etapaId: 'cafe' }),
    ])
  })
  it('voltar ao local original não conta como trocado', () => {
    const volta = relatorio([...EVENTOS_CASO_3, ev.troca('almoco', 'l-rest-b', h('09:30')), ev.troca('almoco', 'l-rest-a', h('09:35'))], OPCOES_PADRAO, 'em_andamento', h('09:40'))
    expect(linha(volta, 'almoco').localTrocado).toBe(false)
  })
})

describe('R6: permanência nas paradas', () => {
  const eventos = [
    ...viagemCompleta(),
    ev.parada('cafe', 'inicio', h('14:00'), { motivo: 'pneu', onde: 'Posto Fictício', tempoPrevistoMin: 15 }),
    ev.parada('cafe', 'previsao', h('14:05'), { onde: 'Posto Novo', tempoPrevistoMin: 20 }),
    ev.parada('cafe', 'fim', h('14:25')),
  ]
  const r = relatorio(eventos)
  const { linhas, totais } = r.permanencias

  it('só as paradas alcançadas (origem e destino ficam de fora), em ordem de horário', () => {
    expect(linhas.map((l) => `${l.tipo}:${l.etapaId}`)).toEqual(['planejada:monlevade', 'planejada:almoco', 'nao_planejada:cafe', 'planejada:cafe', 'planejada:jantar'])
  })
  it('planejada: chegada, saída, permanência real, planejada e diferença', () => {
    expect(linhas[0]).toMatchObject({ chegada: h('08:55'), saida: h('09:14'), realMin: 19, planejadoMin: 15, diferencaMin: 4, situacao: 'completa' })
    expect(linhas[1]).toMatchObject({ realMin: 50, planejadoMin: 60, diferencaMin: -10 })
  })
  it('não planejada: motivo, "onde" e tempo previsto mais recentes; planejada = o previsto', () => {
    expect(linhas[2]).toMatchObject({ motivo: 'pneu', onde: 'Posto Novo', chegada: h('14:00'), saida: h('14:25'), realMin: 25, planejadoMin: 20, diferencaMin: 5 })
  })
  it('total parado (planejadas + não planejadas) e em movimento (duração total − parado)', () => {
    expect(totais).toMatchObject({ paradoMin: 19 + 50 + 25 + 35 + 50, completas: 5, semSaida: 0, emCurso: 0 })
    expect(totais.movimentoMin).toBe(17 * 60 + 43 - 179)
  })
  it('parada sem SAÍMOS: "saída não registrada", fora dos totais', () => {
    const sem = relatorio(viagemCompleta().filter((e) => !(e.tipo === 'saida' && e.etapaId === 'jantar')))
    expect(sem.permanencias.linhas.find((l) => l.etapaId === 'jantar')).toMatchObject({ saida: null, realMin: null, situacao: 'sem_saida' })
    expect(sem.permanencias.totais).toMatchObject({ paradoMin: 19 + 50 + 35, semSaida: 1 })
  })
  it('parada sem VOLTAMOS, com a viagem seguindo: fora dos totais', () => {
    const sem = relatorio([...viagemCompleta(), ev.parada('cafe', 'inicio', h('14:00'), { motivo: 'cafe' })])
    expect(sem.permanencias.linhas.find((l) => l.tipo === 'nao_planejada')).toMatchObject({ saida: null, situacao: 'sem_saida' })
    expect(sem.permanencias.totais.semSaida).toBe(1)
  })
  it('em andamento: parada atual fica "em curso", fora dos totais', () => {
    const andando = relatorio([...EVENTOS_CASO_3, ev.chegada('almoco', h('12:40'))], OPCOES_PADRAO, 'em_andamento', h('12:50'))
    expect(andando.permanencias.linhas.at(-1)).toMatchObject({ etapaId: 'almoco', situacao: 'em_curso' })
    expect(andando.permanencias.totais).toMatchObject({ paradoMin: 19, emCurso: 1, semSaida: 0 })
  })
})

describe('R7: ocorrências em ordem de horário e as observações só com a opção', () => {
  const eventos = [
    ...EVENTOS_CASO_3,
    ev.parada('almoco', 'inicio', h('11:00'), { motivo: 'cafe', onde: 'Padaria Fictícia' }),
    ev.parada('almoco', 'fim', h('11:20')),
    ev.observacao('Texto livre fictício', h('10:00')),
    ev.imprevisto('clima', h('10:30'), 'Chuva forte'),
  ]
  it('ordem: observação 10:00, imprevisto 10:30, parada 11:00', () => {
    const r = relatorio(eventos, OPCOES_PADRAO, 'em_andamento', h('12:00'))
    expect(r.ocorrencias.map((o) => o.tipo)).toEqual(['observacao', 'imprevisto', 'parada_nao_planejada'])
  })
  it('por padrão o texto da observação (e a do imprevisto) não entra; o motivo e o "onde" da parada entram sempre', () => {
    const r = relatorio(eventos, OPCOES_PADRAO, 'em_andamento', h('12:00'))
    expect(JSON.stringify(r)).not.toContain('Texto livre fictício')
    expect(JSON.stringify(r)).not.toContain('Chuva forte')
    expect(r.ocorrencias[2]).toMatchObject({ motivo: 'cafe', onde: 'Padaria Fictícia', realMin: 20, aberta: false })
  })
  it('com "Incluir observações" o texto entra', () => {
    const r = relatorio(eventos, { ...OPCOES_PADRAO, incluirObservacoes: true }, 'em_andamento', h('12:00'))
    expect(r.ocorrencias[0]).toMatchObject({ tipo: 'observacao', texto: 'Texto livre fictício' })
    expect(r.ocorrencias[1]).toMatchObject({ tipo: 'imprevisto', categoria: 'clima', texto: 'Chuva forte' })
  })
  it('as duas opções são independentes', () => {
    const r = relatorio(eventos, { incluirNomes: true, incluirObservacoes: false }, 'em_andamento', h('12:00'))
    expect(r.passageiros.lista).not.toBeNull()
    expect(JSON.stringify(r)).not.toContain('Texto livre fictício')
  })
})

describe('R8: comunicação', () => {
  const eventos = [
    ...EVENTOS_CASO_3,
    ev.atualizacao(h('09:30'), h('00:04', 1), 34),
    ev.atualizacao(h('10:30'), null, null),
    ev.recalibracao('almoco', h('12:40'), h('10:00')),
    ev.recalibracaoPelaLocalizacao('almoco', h('12:45'), h('10:40'), h('10:41')),
    ev.recalibracaoAutomatica('almoco', h('12:50'), h('10:50'), h('10:51')),
    ev.recalibracaoAutomatica('almoco', h('12:55'), h('10:55'), h('10:56')),
  ]
  const r = relatorio(eventos, OPCOES_PADRAO, 'em_andamento', h('11:00'))
  it('mensagens: horário e atraso informado, nunca o texto', () => {
    expect(r.comunicacao.mensagens).toEqual([
      { horario: h('09:30'), previsaoDestino: h('00:04', 1), atrasoMin: 34 },
      { horario: h('10:30'), previsaoDestino: null, atrasoMin: null },
    ])
  })
  it('atualizações de previsão só resumidas: digitadas, pela localização e automáticas', () => {
    expect(r.comunicacao.atualizacoes).toEqual({ digitadas: 1, pelaLocalizacao: 1, automaticas: 2 })
    expect(r.ocorrencias).toEqual([])
  })
})

describe('R9: passageiros', () => {
  const eventos = [
    ...viagemCompleta(),
    ev.status('monlevade', 'p-36', 'nao_embarcou', 'Não apareceu', h('08:56')),
    ev.status('almoco', 'p-01', 'saiu_da_viagem', 'Ficou no almoço', h('13:25')),
    ev.desceram('cafe', 'etapa', ['p-02'], h('16:30')),
    ev.desceram('cafe', 'etapa', ['p-02', 'p-03'], h('16:40')),
    ev.conferencia('cafe', h('16:50'), 'saida', ['p-04', 'p-05']),
    ev.conferencia('jantar', h('21:40'), 'saida', ['p-05', 'p-06']),
  ]
  const r = relatorio(eventos)
  it('cadastrados, conferidos, desceram, não embarcaram, saíram da viagem e chegaram', () => {
    expect(r.passageiros.contagem).toMatchObject({
      cadastrados: 38,
      conferidos: 3,
      desceram: 2,
      naoEmbarcaram: 1,
      sairamDaViagem: 1,
      chegaram: 38 - 1 - 1 - 2,
    })
    expect(r.passageiros.contagem.conferencias).toMatchObject({ total: 2, completas: 2 })
  })
  it('por padrão, sem nomes', () => {
    expect(r.passageiros.lista).toBeNull()
    expect(JSON.stringify(r)).not.toContain('Passageiro 0')
  })
  it('com "Incluir nomes", a lista traz nome e situação', () => {
    const com = relatorio(eventos, { incluirNomes: true, incluirObservacoes: false })
    expect(com.passageiros.lista).toHaveLength(38)
    expect(com.passageiros.lista!.find((p) => p.nome === 'Passageiro 36')?.situacao).toBe('nao_embarcou')
    expect(com.passageiros.lista!.find((p) => p.nome === 'Passageiro 03')?.situacao).toBe('desceu')
    expect(com.passageiros.lista!.find((p) => p.nome === 'Passageiro 10')?.situacao).toBe('chegou')
  })
  it('"chegaram" só com a viagem concluída', () => {
    expect(relatorio(EVENTOS_CASO_3, OPCOES_PADRAO, 'em_andamento', h('09:20')).passageiros.contagem.chegaram).toBeNull()
  })
})

describe('R10: viagem em andamento', () => {
  const r = relatorio(EVENTOS_CASO_3, OPCOES_PADRAO, 'em_andamento', h('10:00'))
  it('marcada "em andamento", com a duração até agora e a chegada prevista no destino', () => {
    expect(r.emAndamento).toBe(true)
    expect(r.resumo).toMatchObject({ chegadaReal: null, atrasoFinalMin: null, duracaoTotalMin: 3 * 60 + 13, duracaoParcial: true, chegadaPrevista: h('00:04', 1), atrasoPrevistoMin: 34 })
  })
})

describe('R11: restaurada de um backup', () => {
  const restaurado: RestauradoDe = { geradoEm: h('09:00'), restauradoEm: h('09:30'), viagemIds: ['viagem-teste'], dispensado: true }
  it('diz isso mesmo com o aviso da tela principal dispensado', () => {
    expect(relatorio(EVENTOS_CASO_3, OPCOES_PADRAO, 'em_andamento', h('10:00'), restaurado).restaurada).toEqual({ geradoEm: h('09:00'), restauradoEm: h('09:30') })
  })
  it('de outra viagem, não', () => {
    expect(relatorio(EVENTOS_CASO_3, OPCOES_PADRAO, 'em_andamento', h('10:00'), { ...restaurado, viagemIds: ['outra'] }).restaurada).toBeNull()
  })
})

describe('R12: quilometragem pela rota, só quando houver', () => {
  const rota = (a: string, la: string, b: string, lb: string, km: number): Trecho => ({ etapaOrigemId: a, localOrigemId: la, etapaDestinoId: b, localDestinoId: lb, duracaoMin: 60, fonte: 'rota', distanciaKm: km })
  it('sem distância guardada, sem quilometragem', () => {
    expect(relatorio(viagemCompleta()).resumo.quilometragem).toBeNull()
  })
  it('soma os trechos percorridos; parcial quando falta algum', () => {
    const trechos = [rota('origem', 'l-saida', 'monlevade', 'l-monlevade', 100.04), rota('monlevade', 'l-monlevade', 'almoco', 'l-rest-a', 250)]
    const r = relatorio(viagemCompleta(), OPCOES_PADRAO, 'concluida', h('01:00', 1), null, planoCom('concluida', { trechos }))
    expect(r.resumo.quilometragem).toEqual({ km: 350, trechosComDistancia: 2, trechosTotais: 5 })
  })
  it('trecho manual com a rota guardada ao lado usa a distância dela', () => {
    const manual: Trecho = { etapaOrigemId: 'origem', localOrigemId: 'l-saida', etapaDestinoId: 'monlevade', localDestinoId: 'l-monlevade', duracaoMin: 120, fonte: 'manual', rota: { duracaoMin: 100, distanciaKm: 90, calculadoEm: h('05:00') } }
    const r = relatorio(viagemCompleta(), OPCOES_PADRAO, 'concluida', h('01:00', 1), null, planoCom('concluida', { trechos: [manual] }))
    expect(r.resumo.quilometragem?.km).toBe(90)
  })
  it('em andamento, só os trechos já percorridos entram', () => {
    const trechos = [rota('origem', 'l-saida', 'monlevade', 'l-monlevade', 100), rota('monlevade', 'l-monlevade', 'almoco', 'l-rest-a', 250)]
    const r = relatorio(EVENTOS_CASO_3, OPCOES_PADRAO, 'em_andamento', h('10:00'), null, planoCom('em_andamento', { trechos }))
    expect(r.resumo.quilometragem).toEqual({ km: 100, trechosComDistancia: 1, trechosTotais: 1 })
  })
})

describe('R13: a pulada não quebra a quilometragem (soma os trechos que passavam por ela)', () => {
  it('café pulado: almoço → café + café → jantar', () => {
    const rota = (a: string, la: string, b: string, lb: string, km: number): Trecho => ({ etapaOrigemId: a, localOrigemId: la, etapaDestinoId: b, localDestinoId: lb, duracaoMin: 60, fonte: 'rota', distanciaKm: km })
    const eventos = viagemCompleta().filter((e) => !('etapaId' in e && e.etapaId === 'cafe'))
    const trechos = [rota('almoco', 'l-rest-a', 'cafe', 'l-cafe', 200), rota('cafe', 'l-cafe', 'jantar', 'l-jantar', 150)]
    const r = relatorio([...eventos, ev.pular('cafe', h('13:35'))], OPCOES_PADRAO, 'concluida', h('01:00', 1), null, planoCom('concluida', { trechos }))
    expect(r.resumo.quilometragem).toEqual({ km: 350, trechosComDistancia: 1, trechosTotais: 4 })
  })
})

describe('R14: o relatório não altera nada', () => {
  it('plano original idêntico e entrada intacta; sem plano original, não monta', () => {
    const antes = JSON.stringify(original)
    const eventos = viagemCompleta()
    const copia = JSON.stringify(eventos)
    relatorio(eventos)
    expect(JSON.stringify(original)).toBe(antes)
    expect(JSON.stringify(eventos)).toBe(copia)
    expect(() => montarRelatorio(PLANO, eventos, PASSAGEIROS, h('01:00', 1), null)).toThrow()
  })
})
