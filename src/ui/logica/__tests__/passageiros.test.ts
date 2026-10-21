import { describe, expect, it } from 'vitest'
import { calcularPlanoOriginal } from '../../../core/previsao'
import { criarEvento } from '../../../core/eventos'
import { ETAPA, horaDemo, PASSAGEIROS_DEMO, PLANO_DEMO } from '../../../demo/dados'
import { agruparPorEmbarque, textoDeQuemFalta, textoTotalDePassageiros } from '../passageiros'
import { textoDoAviso } from '../textos'
import { montarTimeline, textoABordo } from '../textosViagem'

describe('lista agrupada por ponto de embarque', () => {
  it('um grupo por ponto, na ordem do percurso, com a contagem de cada um', () => {
    const grupos = agruparPorEmbarque(PLANO_DEMO.etapas, PLANO_DEMO.locais, PASSAGEIROS_DEMO)
    expect(grupos.map((g) => [g.etapaId, g.passageiros.length])).toEqual([
      [ETAPA.origem, 35],
      [ETAPA.monlevade, 3],
    ])
    expect(grupos.reduce((n, g) => n + g.passageiros.length, 0)).toBe(38)
    expect(grupos[0]!.nome).toContain('Origem')
  })

  it('nomes em ordem alfabética e pontos sem ninguém ficam de fora', () => {
    const [a, b] = PASSAGEIROS_DEMO
    const grupos = agruparPorEmbarque(PLANO_DEMO.etapas, PLANO_DEMO.locais, [{ ...b!, nome: 'Zeca F.' }, { ...a!, nome: 'Ana F.' }])
    expect(grupos).toHaveLength(1)
    expect(grupos[0]!.passageiros.map((p) => p.nome)).toEqual(['Ana F.', 'Zeca F.'])
  })

  it('singular e plural', () => {
    expect(textoTotalDePassageiros(1)).toBe('1 passageiro')
    expect(textoTotalDePassageiros(38)).toBe('38 passageiros')
  })
})

describe('quem falta no quadro da conferência', () => {
  it('lista poucos nomes inteiros e resume muitos', () => {
    expect(textoDeQuemFalta(['Ana F.'])).toBe('Ana F.')
    expect(textoDeQuemFalta(['Ana F.', 'Beto S.', 'Caio T.'])).toBe('Ana F., Beto S., Caio T.')
    expect(textoDeQuemFalta(['A', 'B', 'C', 'D', 'E'])).toBe('A, B, C e mais 2')
  })
})

describe('textos de passageiros', () => {
  it('aviso de nenhum passageiro cadastrado', () => {
    expect(textoDoAviso({ tipo: 'sem_passageiros' }, PLANO_DEMO.etapas, PLANO_DEMO.locais)).toBe('Nenhum passageiro cadastrado.')
  })

  it('a bordo: conferido às HH:MM, sem conferência, ou esperados na saída', () => {
    expect(textoABordo({ tipo: 'conferido', total: 38, conferidoEm: horaDemo('08:40') })).toBe('38/38 a bordo · conferido às 08:40')
    expect(textoABordo({ tipo: 'conferido', total: 38, conferidoEm: null })).toBe('38/38 a bordo · sem conferência')
    expect(textoABordo({ tipo: 'esperados', total: 35 })).toBe('35 esperados na saída')
  })
})

describe('timeline com nomes de passageiros', () => {
  const calculo = calcularPlanoOriginal(PLANO_DEMO, horaDemo('06:00'))
  if (!calculo.ok) throw new Error('plano')
  const base = (id: string, hora: string, seq: number) => ({ id, viagemId: 'v', horarioFato: horaDemo(hora), registradoEm: horaDemo(hora), sequencia: seq })
  const falta = PASSAGEIROS_DEMO[37]!
  const eventos = [
    criarEvento(base('c1', '08:40', 1), {
      tipo: 'conferencia',
      etapaId: ETAPA.monlevade,
      dados: { momento: 'saida', modo: 'so_alguns', confirmados: PASSAGEIROS_DEMO.slice(0, 37).map((p) => p.id), pendentes: [falta.id], resultado: 'incompleta' },
    }),
    criarEvento(base('s1', '08:40', 2), {
      tipo: 'status_passageiro',
      etapaId: ETAPA.monlevade,
      dados: { passageiroId: falta.id, status: 'nao_embarcou', motivo: 'Não apareceu no ponto de embarque.' },
    }),
    criarEvento(base('c2', '09:30', 3), {
      tipo: 'conferencia',
      etapaId: ETAPA.almoco,
      dados: { momento: 'volta', modo: 'so_alguns', confirmados: ['demo-p-01'], pendentes: [], resultado: 'completa_por_contagem' },
    }),
  ]
  const t = montarTimeline(PLANO_DEMO, calculo.plano, eventos, horaDemo('10:00'), PASSAGEIROS_DEMO)

  it('a conferência mostra X/Y e quem faltou, pelo nome', () => {
    expect(t[0]!.titulo).toContain('Conferência na saída de')
    expect(t[0]!.detalhe).toBe(`37/38 a bordo · Falta: ${falta.nome}`)
  })

  it('a mudança de status mostra o nome e o motivo', () => {
    expect(t[1]!.titulo).toBe(`${falta.nome}: não embarcou`)
    expect(t[1]!.detalhe).toBe('Não apareceu no ponto de embarque.')
  })

  it('conferência da volta e por contagem', () => {
    expect(t[2]!.titulo).toBe('Conferência ao voltar à estrada')
    expect(t[2]!.detalhe).toBe('1/1 a bordo (completa por contagem)')
  })

  it('sem a lista de passageiros, não quebra e não inventa nome', () => {
    const sem = montarTimeline(PLANO_DEMO, calculo.plano, eventos, horaDemo('10:00'))
    expect(sem[1]!.titulo).toBe('Passageiro: não embarcou')
  })
})
