import { describe, expect, it } from 'vitest'
import { avisosDoPlano } from '../avisos'
import { calcularEstado, estadosDoPlano } from '../previsao'
import { validarRegistro } from '../registro'
import { paresDeTrechoDasAlternativas } from '../trechos'
import type { DadosPlano, Trecho } from '../tipos'
import {
  avaliarAlternativas,
  paradasFlexiveisPendentes,
  temAlternativasPendentes,
  validarTrechoManualEmViagem,
  validarTroca,
  validarTrocaComChegada,
} from '../viabilidade'
import { congelar, esperarHorario, ev, h, PLANO, TRECHOS_DAS_ALTERNATIVAS } from './fixtures'

const LOCAIS_COM_HORARIO = PLANO.locais.map((l) => {
  if (l.id === 'l-rest-a') return { ...l, abre: '11:00', fecha: '14:00' }
  if (l.id === 'l-rest-b') return { ...l, abre: '11:00', fecha: '15:00' }
  if (l.id === 'l-rest-c') return { ...l, abre: '11:00', fecha: '16:30' }
  return l
})

function plano(trechos: Trecho[] = TRECHOS_DAS_ALTERNATIVAS): DadosPlano {
  return { ...PLANO, locais: LOCAIS_COM_HORARIO, trechos }
}

const semTrecho = (...partes: Array<[string, string]>) =>
  TRECHOS_DAS_ALTERNATIVAS.filter((t) => !partes.some(([o, d]) => t.localOrigemId === o && t.localDestinoId === d))

const EM_TRANSITO = [ev.inicio(h('06:00')), ev.saida('origem', h('06:30')), ev.chegada('monlevade', h('08:25')), ev.saida('monlevade', h('10:55'))]
const PARADOS_EM_MONLEVADE = EM_TRANSITO.slice(0, 3)

describe('fase 6: pares de trecho das alternativas', () => {
  it('lista os pares com alternativa e deixa de fora o par preferido → preferido', () => {
    const pares = paresDeTrechoDasAlternativas(plano([]))
    expect(pares.map((p) => `${p.par.localOrigemId}>${p.par.localDestinoId}`)).toEqual([
      'l-monlevade>l-rest-b',
      'l-monlevade>l-rest-c',
      'l-rest-b>l-cafe',
      'l-rest-c>l-cafe',
    ])
    expect(pares.every((p) => p.duracao.minutos === null)).toBe(true)
  })

  it('mostra a duração e a fonte dos que já foram digitados', () => {
    const pares = paresDeTrechoDasAlternativas(plano())
    expect(pares.map((p) => p.duracao)).toEqual([
      { minutos: 220, fonte: 'manual' },
      { minutos: 250, fonte: 'manual' },
      { minutos: 180, fonte: 'manual' },
      { minutos: 180, fonte: 'manual' },
    ])
  })

  it('quando a vizinha também tem alternativas, cruza todos os candidatos', () => {
    const d: DadosPlano = {
      ...plano([]),
      etapas: PLANO.etapas.map((e) => (e.id === 'cafe' ? { ...e, alternativas: ['l-jantar'] } : e)),
    }
    const chaves = paresDeTrechoDasAlternativas(d).map((p) => `${p.par.localOrigemId}>${p.par.localDestinoId}`)
    // almoço (A, B, C) × café (café, jantar), sem A>café; mais o trecho de Monlevade e o do jantar.
    expect(chaves).toContain('l-rest-a>l-jantar')
    expect(chaves).toContain('l-rest-b>l-jantar')
    expect(chaves).toContain('l-rest-c>l-cafe')
    expect(chaves).not.toContain('l-rest-a>l-cafe')
    expect(chaves).toContain('l-jantar>l-jantar')
    expect(chaves).toHaveLength(8)
  })
})

describe('fase 6: aviso de alternativa sem trecho', () => {
  const avisos = (d: DadosPlano) => avisosDoPlano(d, estadosDoPlano(d)).filter((a) => a.tipo === 'alternativa_sem_trecho')

  it('sem nenhum trecho, avisa as duas alternativas do almoço', () => {
    expect(avisos(plano([]))).toEqual([{ tipo: 'alternativa_sem_trecho', etapaId: 'almoco', localIds: ['l-rest-b', 'l-rest-c'] }])
  })

  it('com todos os trechos, não avisa', () => {
    expect(avisos(plano())).toEqual([])
  })

  it('falta só o trecho do B até o café: avisa só o B', () => {
    const d = plano(semTrecho(['l-rest-b', 'l-cafe']))
    expect(avisos(d)).toEqual([{ tipo: 'alternativa_sem_trecho', etapaId: 'almoco', localIds: ['l-rest-b'] }])
  })
})

describe('fase 6: validarTroca', () => {
  const original = congelar(plano())
  const validar = (d: DadosPlano, eventos: typeof EM_TRANSITO, etapaId: string, localId: string, agora = h('10:57')) =>
    validarTroca(d, original, eventos, agora, etapaId, localId)

  it('troca para uma alternativa com todos os tempos: ok', () => {
    expect(validar(plano(), EM_TRANSITO, 'almoco', 'l-rest-c')).toEqual({ ok: true })
  })

  it('"Inviável" não é recusada no núcleo (a confirmação é da tela)', () => {
    const eventos = [...EM_TRANSITO, ev.troca('almoco', 'l-rest-c', h('10:56'))]
    const lista = avaliarAlternativas(plano(), original, eventos, h('10:57'), 'almoco')
    expect(lista.find((a) => a.localId === 'l-rest-a')?.classe).toBe('inviavel')
    expect(validar(plano(), eventos, 'almoco', 'l-rest-a')).toEqual({ ok: true })
  })

  it('recusa etapa que não é flexível, local fora dos candidatos e o local já escolhido', () => {
    expect(validar(plano(), EM_TRANSITO, 'monlevade', 'l-monlevade')).toMatchObject({ ok: false })
    expect(validar(plano(), EM_TRANSITO, 'almoco', 'l-cafe')).toMatchObject({ ok: false, motivo: expect.stringContaining('alternativas') })
    expect(validar(plano(), EM_TRANSITO, 'almoco', 'l-rest-a')).toMatchObject({ ok: false, motivo: 'Este já é o local escolhido.' })
  })

  it('recusa etapa já alcançada ou pulada', () => {
    const chegou = [...EM_TRANSITO, ev.chegada('almoco', h('14:15'))]
    expect(validar(plano(), chegou, 'almoco', 'l-rest-c', h('14:20'))).toMatchObject({ ok: false, motivo: expect.stringContaining('já foi alcançada') })
    const pulou = [...EM_TRANSITO, ev.pular('almoco', h('10:56'))]
    expect(validar(plano(), pulou, 'almoco', 'l-rest-c')).toMatchObject({ ok: false })
  })

  it('"Sem tempo": falta o trecho até a alternativa; mostra qual', () => {
    const d = plano(semTrecho(['l-monlevade', 'l-rest-b']))
    expect(validar(d, EM_TRANSITO, 'almoco', 'l-rest-b')).toEqual({
      ok: false,
      motivo: 'Falta o tempo de Ponto de embarque até Restaurante B.',
    })
  })

  it('falta o trecho da alternativa até a etapa seguinte: recusa e diz qual', () => {
    const d = plano(semTrecho(['l-rest-c', 'l-cafe']))
    expect(validar(d, EM_TRANSITO, 'almoco', 'l-rest-c')).toEqual({
      ok: false,
      motivo: 'Falta o tempo de Restaurante C até Lanchonete do café.',
    })
  })

  it('a avaliação lista o trecho faltante e se dá para informá-lo', () => {
    const d = plano(semTrecho(['l-rest-c', 'l-cafe'], ['l-monlevade', 'l-rest-b']))
    const emTransito = avaliarAlternativas(d, original, EM_TRANSITO, h('10:57'), 'almoco')
    const c = emTransito.find((a) => a.localId === 'l-rest-c')!
    expect(c.classe).toBe('viavel')
    expect(c.impactoDestinoMin).toBeNull()
    expect(c.trechosFaltantes).toEqual([
      { etapaOrigemId: 'almoco', localOrigemId: 'l-rest-c', etapaDestinoId: 'cafe', localDestinoId: 'l-cafe', podeInformar: true, perna: 'do_local' },
    ])
    const b = emTransito.find((a) => a.localId === 'l-rest-b')!
    expect(b.classe).toBe('sem_tempo')
    // Em trânsito, o trecho a partir de Monlevade já está em curso.
    expect(b.trechosFaltantes[0]).toMatchObject({ localOrigemId: 'l-monlevade', localDestinoId: 'l-rest-b', podeInformar: false })

    const parados = avaliarAlternativas(d, original, PARADOS_EM_MONLEVADE, h('08:30'), 'almoco')
    expect(parados.find((a) => a.localId === 'l-rest-b')?.trechosFaltantes[0]).toMatchObject({ podeInformar: true })
  })

  it('pelo registro: a troca inválida é recusada e a válida, aceita', () => {
    const d = plano(semTrecho(['l-rest-c', 'l-cafe']))
    const troca = (localId: string) => ({ tipo: 'troca_local' as const, etapaId: 'almoco', dados: { localId } })
    expect(validarRegistro(d, original, EM_TRANSITO, troca('l-rest-c'), h('10:57'), h('10:57'))).toMatchObject({ ok: false })
    expect(validarRegistro(d, original, EM_TRANSITO, troca('l-rest-b'), h('10:57'), h('10:57'))).toEqual({ ok: true })
  })

  it('depois da troca válida, a previsão e o impacto batem com a avaliação', () => {
    const antes = avaliarAlternativas(plano(), original, EM_TRANSITO, h('10:57'), 'almoco')
    const impacto = antes.find((a) => a.localId === 'l-rest-c')!.impactoDestinoMin
    const eventos = [...EM_TRANSITO, ev.troca('almoco', 'l-rest-c', h('10:57'))]
    const depois = calcularEstado(plano(), original, eventos, h('10:57'))
    const antesEstado = calcularEstado(plano(), original, EM_TRANSITO, h('10:57'))
    expect(depois.etapas.find((e) => e.etapaId === 'almoco')?.localId).toBe('l-rest-c')
    expect(
      (new Date(depois.chegadaDestino!.instante).getTime() - new Date(antesEstado.chegadaDestino!.instante).getTime()) / 60000,
    ).toBe(impacto)
  })
})

describe('fase 6: trecho manual durante a viagem', () => {
  const d = plano(semTrecho(['l-rest-b', 'l-cafe'], ['l-monlevade', 'l-rest-c']))
  const original = congelar(d)
  const estado = (eventos: typeof EM_TRANSITO) => calcularEstado(d, original, eventos, h('10:57'))
  const parCafe = { etapaOrigemId: 'almoco', localOrigemId: 'l-rest-b', etapaDestinoId: 'cafe', localDestinoId: 'l-cafe' }
  const parMonlevade = { etapaOrigemId: 'monlevade', localOrigemId: 'l-monlevade', etapaDestinoId: 'almoco', localDestinoId: 'l-rest-c' }

  it('permitido em trecho futuro, entre etapas ainda não alcançadas', () => {
    expect(validarTrechoManualEmViagem(d, estado(EM_TRANSITO), parCafe, 180)).toEqual({ ok: true })
  })

  it('permitido da etapa em que estamos para a seguinte', () => {
    expect(validarTrechoManualEmViagem(d, estado(PARADOS_EM_MONLEVADE), parMonlevade, 250)).toEqual({ ok: true })
  })

  it('recusado em trecho já percorrido ou em curso', () => {
    expect(validarTrechoManualEmViagem(d, estado(EM_TRANSITO), parMonlevade, 250)).toMatchObject({
      ok: false,
      motivo: expect.stringContaining('já foi percorrido'),
    })
    const noAlmoco = [...EM_TRANSITO, ev.chegada('almoco', h('14:15'))]
    expect(validarTrechoManualEmViagem(d, estado(noAlmoco), parCafe, 180)).toMatchObject({ ok: true })
    const saiuDoAlmoco = [...noAlmoco, ev.saida('almoco', h('15:15')), ev.chegada('cafe', h('18:00'))]
    expect(validarTrechoManualEmViagem(d, estado(saiuDoAlmoco), parCafe, 180)).toMatchObject({ ok: false })
  })

  it('recusa par que não liga etapas vizinhas, local que não é candidato, duração inválida e par que já tem tempo', () => {
    expect(validarTrechoManualEmViagem(d, estado(EM_TRANSITO), { ...parCafe, etapaDestinoId: 'jantar' }, 60)).toMatchObject({ ok: false })
    expect(validarTrechoManualEmViagem(d, estado(EM_TRANSITO), { ...parCafe, localOrigemId: 'l-jantar' }, 60)).toMatchObject({ ok: false })
    expect(validarTrechoManualEmViagem(d, estado(EM_TRANSITO), parCafe, 0)).toMatchObject({ ok: false })
    const comTempo = { ...parCafe, localOrigemId: 'l-rest-c' }
    expect(validarTrechoManualEmViagem(d, estado(EM_TRANSITO), comTempo, 60)).toMatchObject({ ok: false, motivo: 'Este trecho já tem tempo definido.' })
  })

  it('recusa com a viagem fora de andamento', () => {
    const planejando = { ...d, viagem: { ...d.viagem, status: 'planejando' as const } }
    expect(validarTrechoManualEmViagem(planejando, estado(EM_TRANSITO), parCafe, 180)).toMatchObject({ ok: false })
  })

  it('o plano original guarda horários, não durações: informar o tempo não o muda', () => {
    const antes = JSON.stringify(original)
    const comTrecho: DadosPlano = {
      ...d,
      trechos: [...d.trechos, { ...parCafe, duracaoMin: 180, fonte: 'manual' }],
    }
    expect(JSON.stringify(congelar(comTrecho))).toBe(antes)
  })
})

describe('fase 6: paradas pendentes e botão VER ALTERNATIVAS', () => {
  const original = congelar(plano())
  const estado = (eventos: typeof EM_TRANSITO) => calcularEstado(plano(), original, eventos, h('12:00'))

  it('há alternativas pendentes enquanto o almoço não foi alcançado nem pulado', () => {
    expect(paradasFlexiveisPendentes(plano(), estado(EM_TRANSITO)).map((e) => e.id)).toEqual(['almoco', 'cafe', 'jantar'])
    expect(temAlternativasPendentes(plano(), estado(EM_TRANSITO))).toBe(true)
  })

  it('sem parada flexível com mais de um local pendente, não há o que ver', () => {
    const chegou = [...EM_TRANSITO, ev.chegada('almoco', h('14:15'))]
    expect(paradasFlexiveisPendentes(plano(), estado(chegou)).map((e) => e.id)).toEqual(['cafe', 'jantar'])
    expect(temAlternativasPendentes(plano(), estado(chegou))).toBe(false)
    const pulou = [...EM_TRANSITO, ev.pular('almoco', h('10:56'))]
    expect(temAlternativasPendentes(plano(), estado(pulou))).toBe(false)
  })
})

describe('fase 6: troca com a chegada pelo Google Maps (trecho em curso sem tempo)', () => {
  // Em trânsito para o almoço, o C não tem o trecho de Monlevade.
  const d = plano(semTrecho(['l-monlevade', 'l-rest-c']))
  const original = congelar(d)
  const com = (eventos: typeof EM_TRANSITO, localId: string, horario: Parameters<typeof h>[0], agora = h('10:57')) =>
    validarTrocaComChegada(d, original, eventos, agora, 'almoco', localId, h(horario))

  it('a lista mostra o C como "Sem tempo", exigindo a chegada pelo Google Maps; A e B não', () => {
    const lista = avaliarAlternativas(d, original, EM_TRANSITO, h('10:57'), 'almoco')
    const por = (id: string) => lista.find((a) => a.localId === id)!
    expect(por('l-rest-a')).toMatchObject({ classe: 'inviavel', escolhida: true, exigeChegadaPeloMaps: false })
    expect(por('l-rest-b')).toMatchObject({ classe: 'pouca_margem', exigeChegadaPeloMaps: false })
    expect(por('l-rest-c')).toMatchObject({ classe: 'sem_tempo', exigeChegadaPeloMaps: true })
  })

  it('a troca simples continua recusada; a com chegada é aceita', () => {
    expect(validarTroca(d, original, EM_TRANSITO, h('10:57'), 'almoco', 'l-rest-c')).toMatchObject({ ok: false })
    expect(com(EM_TRANSITO, 'l-rest-c', '15:05')).toEqual({ ok: true })
  })

  it('recusa horário no passado e horário igual ao atual é aceito (mesma trava da recalibração)', () => {
    expect(com(EM_TRANSITO, 'l-rest-c', '10:50')).toEqual({ ok: false, motivo: 'O horário informado é anterior ao horário atual.' })
    expect(com(EM_TRANSITO, 'l-rest-c', '10:57')).toEqual({ ok: true })
  })

  it('local que já tem tempo também é aceito (é o caso da consulta ao Google Maps)', () => {
    expect(com(EM_TRANSITO, 'l-rest-b', '15:05')).toEqual({ ok: true })
  })

  it('o trecho do local até a etapa seguinte continua obrigatório', () => {
    const faltaDois = plano(semTrecho(['l-monlevade', 'l-rest-c'], ['l-rest-c', 'l-cafe']))
    const lista = avaliarAlternativas(faltaDois, congelar(faltaDois), EM_TRANSITO, h('10:57'), 'almoco')
    expect(lista.find((a) => a.localId === 'l-rest-c')?.exigeChegadaPeloMaps).toBe(false)
    expect(
      validarTrocaComChegada(faltaDois, congelar(faltaDois), EM_TRANSITO, h('10:57'), 'almoco', 'l-rest-c', h('15:05')),
    ).toEqual({ ok: false, motivo: expect.stringContaining('Restaurante C até Lanchonete do café') })
  })

  it('parado na etapa anterior o trecho ainda é futuro: a lista pede o tempo, não a chegada; a troca com chegada vale', () => {
    const lista = avaliarAlternativas(d, original, PARADOS_EM_MONLEVADE, h('08:30'), 'almoco')
    expect(lista.find((a) => a.localId === 'l-rest-c')?.exigeChegadaPeloMaps).toBe(false)
    expect(com(PARADOS_EM_MONLEVADE, 'l-rest-c', '15:05', h('08:30'))).toEqual({ ok: true })
  })

  it('recusa parada já alcançada e local fora dos candidatos', () => {
    const chegou = [...EM_TRANSITO, ev.chegada('almoco', h('14:15'))]
    expect(com(chegou, 'l-rest-c', '15:05', h('14:20'))).toMatchObject({ ok: false })
    expect(com(EM_TRANSITO, 'l-cafe', '15:05')).toMatchObject({ ok: false })
  })

  it('cenário "restaurante inviável e troca": escolher o C informando 15:05 dá o resultado do cenário', () => {
    const eventos = [...EM_TRANSITO, ev.troca('almoco', 'l-rest-c', h('10:57')), ev.recalibracao('almoco', h('15:05'), h('10:57'))]
    const e = calcularEstado(d, original, eventos, h('10:57'))
    const almoco = e.etapas.find((x) => x.etapaId === 'almoco')!
    expect(almoco.localId).toBe('l-rest-c')
    expect(almoco.chegada?.origem).toBe('recalibracao')
    esperarHorario(almoco.chegada?.instante, h('15:05'))
    esperarHorario(almoco.saida?.instante, h('16:05'))
    esperarHorario(e.etapas.find((x) => x.etapaId === 'cafe')?.chegada?.instante, h('19:05'))
    esperarHorario(e.chegadaDestino?.instante, h('02:35', 1))
    expect(e.atrasoDestinoMin).toBe(185)
  })

  it('no mesmo minuto vale a ordem de gravação: a recalibração depois da troca vale; a troca depois dela a cancela', () => {
    const depois = [...EM_TRANSITO, ev.troca('almoco', 'l-rest-c', h('10:57')), ev.recalibracao('almoco', h('15:05'), h('10:57'))]
    esperarHorario(calcularEstado(d, original, depois, h('10:57')).etapas.find((x) => x.etapaId === 'almoco')?.chegada?.instante, h('15:05'))
    const antes = [...EM_TRANSITO, ev.recalibracao('almoco', h('15:05'), h('10:57')), ev.troca('almoco', 'l-rest-b', h('10:57'))]
    const e = calcularEstado(d, original, antes, h('10:57'))
    expect(e.etapas.find((x) => x.etapaId === 'almoco')?.chegada?.origem).toBe('calculado')
  })

  it('depois de escolher o C pelo Maps, as outras alternativas são avaliadas sem a chegada informada', () => {
    const eventos = [...EM_TRANSITO, ev.troca('almoco', 'l-rest-c', h('10:57')), ev.recalibracao('almoco', h('15:05'), h('10:57'))]
    const lista = avaliarAlternativas(d, original, eventos, h('10:57'), 'almoco')
    const por = (id: string) => lista.find((a) => a.localId === id)!
    esperarHorario(por('l-rest-a').chegada, h('14:15'))
    esperarHorario(por('l-rest-b').chegada, h('14:35'))
    expect(por('l-rest-c')).toMatchObject({ escolhida: true, classe: 'viavel', margemMin: 25 })
    expect(por('l-rest-b').classe).toBe('pouca_margem')
  })
})

