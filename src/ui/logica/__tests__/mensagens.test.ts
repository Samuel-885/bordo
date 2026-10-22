import { afterEach, describe, expect, it } from 'vitest'
import { MODELO_PADRAO, VARIAVEIS_DO_MODELO } from '../../../core/modelos'
import { calcularEstado } from '../../../core/previsao'
import { agora } from '../../../core/relogio'
import { instante } from '../../../core/tempo'
import type { DadosPlano, Passageiro } from '../../../core/tipos'
import { avaliarAlternativas, paradasFlexiveisPendentes } from '../../../core/viabilidade'
import { CENARIOS, cenarioPorId } from '../../../demo/cenarios'
import { ETAPA, horaDemo, LOCAL, PASSAGEIROS_DEMO } from '../../../demo/dados'
import { SessaoDemo } from '../../../demo/executor'
import {
  gerarMensagem,
  previsaoInformada,
  textoDoHorarioComAtraso,
  valoresDaAtualizacao,
  valoresDeExemplo,
  valoresDoRestaurante,
} from '../mensagens'
import { montarTimeline } from '../textosViagem'

let sessao: SessaoDemo | null = null
afterEach(() => {
  sessao?.encerrar()
  sessao = null
})

function nova(id: string, passos?: number): SessaoDemo {
  sessao = new SessaoDemo(cenarioPorId(id))
  if (passos === undefined) sessao.executarTudo()
  else sessao.executarAte(passos)
  return sessao
}

/** O plano da demonstração com o plano original da sessão (a viagem iniciada). */
const planoDa = (s: SessaoDemo, extra: Partial<DadosPlano['viagem']> = {}): DadosPlano => ({
  ...s.dados,
  viagem: { ...s.dados.viagem, planoOriginal: s.original, ...extra },
})

const atualizacao = (s: SessaoDemo, passageiros: readonly Passageiro[] = PASSAGEIROS_DEMO, extra = {}) =>
  gerarMensagem('atualizacao', null, valoresDaAtualizacao(planoDa(s, extra), s.eventos, passageiros, agora())).texto

describe('mensagem de atualização: modelo padrão no cenário da demonstração', () => {
  it('em viagem, saída atrasada em 17 min (caso 1)', () => {
    const s = nova('saida-atrasada')
    s.definirRelogio(horaDemo('06:50'))
    expect(atualizacao(s)).toBe(
      [
        '🚌 Atualização da viagem',
        'Unidade Demo — Ipatinga',
        '',
        'Situação: em viagem',
        'Próxima parada: Ponto de embarque, às 08:42',
        'Chegada em Ribeirão Preto: 23:47 (atraso de 17 min)',
        'Passageiros: 35 a bordo',
        '',
        'Atualizado às 06:50',
      ].join('\n'),
    )
  })

  it('aguardando saída: esperados na saída, no singular e no plural', () => {
    const s = nova('saida-atrasada', 1)
    const texto = atualizacao(s)
    expect(texto).toContain('Situação: aguardando saída')
    expect(texto).toContain('Passageiros: 35 esperados na saída')
    expect(atualizacao(s, PASSAGEIROS_DEMO.slice(0, 1))).toContain('Passageiros: 1 esperado na saída')
  })

  it('parados em Monlevade, destino depois da meia-noite com o dia', () => {
    const s = nova('chegada-atrasada-monlevade')
    const texto = atualizacao(s)
    expect(texto).toContain('Situação: parados em Ponto de embarque')
    expect(texto).toContain('Próxima parada: Restaurante A, às 12:30')
    expect(texto).toContain('Chegada em Ribeirão Preto: 00:00 do dia 15 (atraso de 30 min)')
    expect(texto).toContain('Passageiros: 38 esperados na saída')
  })

  it('parada não planejada: sem o motivo', () => {
    const s = nova('parada-nao-planejada', 3)
    const r = s.registrarManual({ tipo: 'parada_nao_planejada', etapaId: ETAPA.almoco, dados: { fase: 'inicio', motivo: 'passageiro_mal' } })
    // O cenário pode já ter aberto a parada; só interessa a situação e que o motivo não vaze.
    void r
    const texto = atualizacao(s)
    expect(texto.toLowerCase()).not.toContain('passando mal')
    expect(texto.toLowerCase()).not.toContain('pneu')
    expect(texto).toMatch(/Situação: (parada não planejada|em viagem)/)
  })

  it('chegamos: situação com a chegada real; sem próxima parada, previsão nem passageiros', () => {
    const s = nova('chegada-ao-destino')
    const texto = atualizacao(s)
    const [, , , situacao] = texto.split('\n')
    expect(situacao).toMatch(/^Situação: chegamos a Ribeirão Preto às \d\d:\d\d( do dia \d+)? \(.+\)$/)
    expect(texto).not.toContain('Próxima parada')
    expect(texto).not.toContain('Chegada em Ribeirão Preto')
    expect(texto).not.toContain('Passageiros')
    expect(texto).toContain('Atualizado às')
  })

  it('sem identificação a linha some; sem passageiros cadastrados a linha de passageiros some', () => {
    const s = nova('saida-atrasada')
    const texto = atualizacao(s, [], { identificacao: '   ' })
    expect(texto.startsWith('🚌 Atualização da viagem\n\nSituação: em viagem')).toBe(true)
    expect(texto).not.toContain('Passageiros')
    expect(texto).not.toContain('Unidade')
  })
})

describe('previsão no destino com o atraso', () => {
  const h = instante('2026-11-14T23:47:00-03:00')
  const agoraDia = instante('2026-11-14T12:00:00-03:00')
  it('atrasado, no horário, adiantado e sem original', () => {
    expect(textoDoHorarioComAtraso({ instante: h, origem: 'calculado', atrasoMin: 17 }, agoraDia)).toBe('23:47 (atraso de 17 min)')
    expect(textoDoHorarioComAtraso({ instante: h, origem: 'calculado', atrasoMin: 75 }, agoraDia)).toBe('23:47 (atraso de 1h15)')
    expect(textoDoHorarioComAtraso({ instante: h, origem: 'calculado', atrasoMin: 5 }, agoraDia)).toBe('23:47 (no horário)')
    expect(textoDoHorarioComAtraso({ instante: h, origem: 'calculado', atrasoMin: -5 }, agoraDia)).toBe('23:47 (no horário)')
    expect(textoDoHorarioComAtraso({ instante: h, origem: 'calculado', atrasoMin: -6 }, agoraDia)).toBe('23:47 (adiantado 6 min)')
    expect(textoDoHorarioComAtraso({ instante: h, origem: 'calculado', atrasoMin: null }, agoraDia)).toBe('23:47')
  })

  it('previsão informada na timeline: o destino e o atraso do estado atual', () => {
    const s = nova('saida-atrasada')
    const p = previsaoInformada(planoDa(s), s.eventos, agora())
    const estado = calcularEstado(planoDa(s), s.original, s.eventos, agora())
    expect(p).toEqual({ previsaoDestino: estado.chegadaDestino!.instante, atrasoMin: 17 })
  })
})

describe('mensagem para o restaurante', () => {
  /** A viagem logo depois da saída de Monlevade: a caminho do almoço. */
  function emDirecaoAoAlmoco() {
    const s = nova('chegada-atrasada-monlevade')
    s.registrarManual({ tipo: 'saida', etapaId: ETAPA.monlevade })
    return s
  }

  it('grupo = passageiros a bordo ao chegar + equipe; chegada prevista no local', () => {
    const s = emDirecaoAoAlmoco()
    const plano = planoDa(s, { equipe: 3 })
    const chegada = avaliarAlternativas(plano, s.original, s.eventos, agora(), ETAPA.almoco).find((a) => a.escolhida)!.chegada!
    const r = valoresDoRestaurante(plano, s.eventos, PASSAGEIROS_DEMO, ETAPA.almoco, LOCAL.restA, chegada, agora())
    expect(r.grupo).toBe(41)
    expect(r.valores).toMatchObject({ grupo: '41', local: 'Restaurante A', identificacao: 'Unidade Demo — Ipatinga' })
    expect(gerarMensagem('restaurante', null, r.valores).texto).toBe(
      `Olá! Somos um grupo de 41 pessoas (Unidade Demo — Ipatinga), em ônibus, com chegada prevista às ${r.valores.chegada}. Podem nos receber? Se o horário mudar, avisamos.`,
    )
  })

  it('inclui quem desce na própria parada e não inclui quem já desceu antes', () => {
    const s = emDirecaoAoAlmoco()
    const plano = planoDa(s)
    const [a, b, c] = PASSAGEIROS_DEMO as [Passageiro, Passageiro, Passageiro]
    const lista = [
      { ...a, etapaDesembarqueId: ETAPA.almoco },
      { ...b, etapaDesembarqueId: ETAPA.monlevade },
      c,
    ]
    const r = valoresDoRestaurante(plano, s.eventos, lista, ETAPA.almoco, LOCAL.restA, horaDemo('12:30'), agora())
    expect(r.grupo).toBe(2)
  })

  it('sem passageiros e sem equipe, o grupo é zero (a tela desliga o botão)', () => {
    const s = emDirecaoAoAlmoco()
    const r = valoresDoRestaurante(planoDa(s), s.eventos, [], ETAPA.almoco, LOCAL.restA, horaDemo('12:30'), agora())
    expect(r.grupo).toBe(0)
    expect(r.valores.grupo).toBe('')
  })

  it('só equipe, sem passageiros: o grupo é a equipe', () => {
    const s = emDirecaoAoAlmoco()
    const r = valoresDoRestaurante(planoDa(s, { equipe: 2 }), s.eventos, [], ETAPA.almoco, LOCAL.restA, horaDemo('12:30'), agora())
    expect(r.grupo).toBe(2)
  })
})

describe('a mensagem nunca leva nomes de passageiros', () => {
  // Nomes inconfundíveis: nenhuma palavra deles aparece em rótulo, etapa ou local da demonstração.
  const NOMES = ['Zulmira Quintanilha', 'Euclides Brandão', 'Ondina Wanderley', 'Teodoro Vasconcelos Neto', 'Hermenegildo Pacheco']
  const passageiros: Passageiro[] = PASSAGEIROS_DEMO.map((p, i) => ({ ...p, nome: `${NOMES[i % NOMES.length]} ${i}` }))
  const palavras = [...new Set(NOMES.flatMap((n) => n.split(' ')))]

  /** Um modelo com todas as variáveis de cada mensagem. */
  const comTodas = (id: 'atualizacao' | 'restaurante') => VARIAVEIS_DO_MODELO[id].map((v) => `${v.nome}={${v.nome}}`).join('\n')

  function semNomes(texto: string) {
    for (const palavra of palavras) expect(texto, `"${palavra}" vazou na mensagem`).not.toContain(palavra)
    expect(texto).not.toMatch(/\d{2,} - /) // nenhum "numero - nome"
  }

  it('em todos os passos de todos os cenários, com o padrão e com um modelo com todas as variáveis', () => {
    let geradas = 0
    for (const cenario of CENARIOS) {
      sessao?.encerrar()
      sessao = new SessaoDemo(cenario)
      const s = sessao
      const gerar = () => {
        const plano = planoDa(s, { equipe: 4 })
        const valores = valoresDaAtualizacao(plano, s.eventos, passageiros, agora())
        for (const modelo of [null, comTodas('atualizacao')]) semNomes(gerarMensagem('atualizacao', modelo, valores).texto)
        const estado = calcularEstado(plano, s.original, s.eventos, agora())
        for (const etapa of paradasFlexiveisPendentes(plano, estado)) {
          for (const a of avaliarAlternativas(plano, s.original, s.eventos, agora(), etapa.id)) {
            if (!a.chegada) continue
            const r = valoresDoRestaurante(plano, s.eventos, passageiros, etapa.id, a.localId, a.chegada, agora())
            for (const modelo of [null, comTodas('restaurante')]) semNomes(gerarMensagem('restaurante', modelo, r.valores).texto)
            geradas += 1
          }
        }
        // E a timeline, que mostra nomes só no celular, não vaza nada para a mensagem: o evento
        // de atualização gerada guarda só o horário e a previsão.
        semNomes(JSON.stringify(previsaoInformada(plano, s.eventos, agora())))
      }
      gerar()
      while (s.avancarPasso()) gerar()
    }
    expect(geradas).toBeGreaterThan(20)
  })

  it('mesmo com passageiros cadastrados que tenham o nome de uma etapa ou de um local, o texto traz só a contagem', () => {
    const s = nova('saida-atrasada')
    const plano = planoDa(s, { identificacao: 'Unidade Demo — Ipatinga' })
    const estranhos = passageiros.map((p) => ({ ...p, nome: 'Restaurante A' }))
    const texto = gerarMensagem('atualizacao', null, valoresDaAtualizacao(plano, s.eventos, estranhos, agora())).texto
    expect(texto).toContain('Passageiros: 35 a bordo')
    expect(texto.match(/Restaurante A/g)).toBeNull()
  })

  it('os valores de exemplo também não trazem nomes', () => {
    for (const id of ['atualizacao', 'restaurante'] as const) {
      const texto = gerarMensagem(id, null, valoresDeExemplo(id)).texto
      semNomes(texto)
    }
    expect(MODELO_PADRAO.atualizacao).not.toMatch(/\{nome\}/)
  })
})

describe('timeline: atualização gerada e observação', () => {
  it('mostra o horário e a previsão, sem texto de mensagem', () => {
    const s = nova('saida-atrasada')
    s.definirRelogio(horaDemo('06:50'))
    const plano = planoDa(s)
    s.registrarManual({ tipo: 'atualizacao_gerada', dados: previsaoInformada(plano, s.eventos, agora()) })
    s.registrarManual({ tipo: 'observacao', dados: { texto: 'Parada rápida para o motorista' } })
    const itens = montarTimeline(plano, s.original, s.eventos, agora(), PASSAGEIROS_DEMO)
    const gerada = itens.find((i) => i.titulo.startsWith('Atualização gerada'))!
    expect(gerada.titulo).toBe('Atualização gerada · previsão 23:47 (+17 min)')
    expect(gerada.detalhe).toBeNull()
    expect(gerada.corrigivel).toBe(false)
    const obs = itens.find((i) => i.titulo === 'Observação')!
    expect(obs).toMatchObject({ detalhe: 'Parada rápida para o motorista', corrigivel: true, atraso: null })
  })
})
