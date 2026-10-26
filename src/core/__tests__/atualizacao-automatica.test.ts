// Atualizar sozinho pela localização (núcleo): quando atualiza, quando pausa e quando não grava.
// A gravação é uma recalibração comum; o campo `automatica` é opcional e aditivo.

import { describe, expect, it } from 'vitest'
import { montarBackup, serializarBackup, validarBackup, type ConteudoBackup } from '../backup'
import { CONFIG } from '../config'
import {
  decidirGravacao,
  proximoCiclo,
  situacaoDoAutomatico,
  textoDaFalhaAutomatica,
  textoDaPausa,
} from '../atualizacaoAutomatica'
import { criarPrevia } from '../localizacao'
import { calcularEstado } from '../previsao'
import { ETAPAS, EVENTOS_CASO_1, EVENTOS_CASO_2, EVENTOS_CASO_3, LOCAIS, PLANO, congelar, esperarHorario, etapaDe, ev, h } from './fixtures'

const original = congelar()
const situacao = (eventos: Parameters<typeof situacaoDoAutomatico>[2], agora: string, coordenadas = true) =>
  situacaoDoAutomatico(PLANO, original, eventos, coordenadas, h(agora))

describe('atualização automática: quando atualiza e quando pausa', () => {
  it('o intervalo e a diferença mínima vêm da configuração', () => {
    expect(CONFIG.atualizacaoAutomaticaMin).toBe(5)
    expect(CONFIG.atualizacaoAutomaticaDiferencaMinMin).toBe(2)
    esperarHorario(proximoCiclo(h('10:42')), h('10:47'))
  })

  it('em trânsito para a próxima etapa, com coordenadas: atualiza', () => {
    expect(situacao(EVENTOS_CASO_3, '11:40')).toEqual({ situacao: 'ativo', etapaId: 'almoco' })
    expect(situacao(EVENTOS_CASO_1, '07:00')).toEqual({ situacao: 'ativo', etapaId: 'monlevade' })
  })

  it('parado numa etapa pausa; depois do SAÍMOS volta a valer', () => {
    expect(situacao(EVENTOS_CASO_2, '09:00')).toEqual({ situacao: 'pausado', motivo: 'parado' })
    expect(situacao(EVENTOS_CASO_3, '09:15')).toEqual({ situacao: 'ativo', etapaId: 'almoco' })
  })

  it('aguardando a saída da origem pausa', () => {
    expect(situacao([ev.inicio(h('06:00'))], '06:10')).toEqual({ situacao: 'pausado', motivo: 'parado' })
  })

  it('em parada não planejada pausa; depois do VOLTAMOS volta a valer', () => {
    const paramos = ev.parada('almoco', 'inicio', h('10:00'))
    expect(situacao([...EVENTOS_CASO_3, paramos], '10:05')).toEqual({ situacao: 'pausado', motivo: 'parada_nao_planejada' })
    expect(situacao([...EVENTOS_CASO_3, paramos, ev.parada('almoco', 'fim', h('10:20'))], '10:25')).toEqual({ situacao: 'ativo', etapaId: 'almoco' })
  })

  it('sem coordenadas na próxima parada pausa', () => {
    expect(situacao(EVENTOS_CASO_3, '11:40', false)).toEqual({ situacao: 'pausado', motivo: 'sem_coordenadas' })
  })

  it('o destino como próxima etapa, em trânsito, continua atualizando até o CHEGAMOS final', () => {
    const ate = [
      ...EVENTOS_CASO_3,
      ev.chegada('almoco', h('12:50')),
      ev.saida('almoco', h('13:50')),
      ev.chegada('cafe', h('17:00')),
      ev.saida('cafe', h('17:30')),
      ev.chegada('jantar', h('21:30')),
      ev.saida('jantar', h('22:20')),
    ]
    expect(situacao(ate, '23:50')).toEqual({ situacao: 'ativo', etapaId: 'destino' })
    expect(situacao(ate, '23:59')).toEqual({ situacao: 'ativo', etapaId: 'destino' })
    expect(situacao([...ate, ev.chegada('destino', h('00:10', 1))], '00:11')).toEqual({ situacao: 'encerrada' })
  })

  it('cada pausa tem texto próprio, e nenhuma é "chegando ao destino"', () => {
    const textos = [textoDaPausa('parado'), textoDaPausa('parada_nao_planejada'), textoDaPausa('sem_coordenadas')]
    expect(new Set(textos).size).toBe(3)
    expect(textoDaPausa('parado', 'Café (Lanchonete)')).toContain('Café (Lanchonete)')
    for (const t of textos) expect(t.toLowerCase()).not.toContain('destino')
  })
})

describe('atualização automática: quando grava e quando não grava', () => {
  // 11:40, em trânsito para o almoço: a previsão atual vem do roteiro.
  const agora = h('11:40')
  const previsaoAtual = etapaDe(calcularEstado(PLANO, original, EVENTOS_CASO_3, agora), 'almoco').chegada?.instante ?? null
  const decidir = (minutosCarro: number, precisaoM: number, previsao = previsaoAtual, quando = agora) =>
    decidirGravacao({
      plano: PLANO, original, eventos: EVENTOS_CASO_3, etapaId: 'almoco',
      previa: criarPrevia({ minutosCarro, distanciaKm: 80, servico: 'osrm' }, precisaoM, quando),
      fator: 1.15, previsaoAtual: previsao, agora: quando,
    })

  it('o horário é o do cálculo + tempo de carro × fator ônibus, sempre aplicado', () => {
    // 100 min de carro × 1,15 = 115 → 13:35
    const d = decidir(100, 20)
    expect(d.grava).toBe(true)
    if (d.grava) {
      esperarHorario(d.horario, h('13:35'))
      esperarHorario(d.calculadoEm, h('11:40'))
    }
  })

  it('diferença de 2 min ou mais da previsão atual grava; menos de 2 não', () => {
    expect(previsaoAtual).not.toBeNull()
    // 100 min de carro → 13:35
    expect(decidir(100, 20, h('13:35'))).toEqual({ grava: false, motivo: 'diferenca_pequena' })
    expect(decidir(100, 20, h('13:34'))).toEqual({ grava: false, motivo: 'diferenca_pequena' })
    expect(decidir(100, 20, h('13:36'))).toEqual({ grava: false, motivo: 'diferenca_pequena' })
    expect(decidir(100, 20, h('13:33')).grava).toBe(true)
    expect(decidir(100, 20, h('13:37')).grava).toBe(true)
  })

  it('sem previsão atual, grava', () => {
    expect(decidir(100, 20, null).grava).toBe(true)
  })

  it('GPS impreciso (acima de 1 km) nunca grava, mesmo com horário muito diferente', () => {
    expect(decidir(100, 1001)).toEqual({ grava: false, motivo: 'impreciso' })
    expect(decidir(100, 1000).grava).toBe(true)
  })

  it('horário no passado fica de fora pela mesma trava da recalibração', () => {
    // calculado às 11:00 com 10 min de carro → 11:12, anterior ao agora (11:40)
    const d = decidirGravacao({
      plano: PLANO, original, eventos: EVENTOS_CASO_3, etapaId: 'almoco',
      previa: criarPrevia({ minutosCarro: 10, distanciaKm: 5, servico: 'osrm' }, 20, h('11:00')),
      fator: 1.15, previsaoAtual, agora,
    })
    expect(d).toEqual({ grava: false, motivo: 'travada' })
  })

  it('cada falha tem um motivo curto próprio', () => {
    const erros = ['negada', 'sem_sinal', 'gps_tempo_esgotado', 'sem_suporte', 'sem_internet', 'tempo_esgotado', 'limite', 'fora', 'sem_rota', 'impreciso', 'travada']
    const textos = erros.map(textoDaFalhaAutomatica)
    expect(new Set(textos).size).toBe(erros.length)
    expect(textoDaFalhaAutomatica('sem_internet')).toBe('sem internet ou sinal fraco')
  })
})

describe('atualização automática: o evento', () => {
  const base = EVENTOS_CASO_3

  it('é uma recalibração comum: mesma previsão, mesmas contas, com a marca "automática"', () => {
    const eventos = [...base, ev.recalibracaoAutomatica('almoco', h('13:02'), h('11:40'), h('11:41'))]
    const estado = calcularEstado(PLANO, original, eventos, h('11:41'))
    const chegada = etapaDe(estado, 'almoco').chegada
    esperarHorario(chegada?.instante, h('13:02'))
    esperarHorario(chegada?.pelaLocalizacaoEm, h('11:40'))
    expect(chegada?.automatica).toBe(true)
    expect(estado.atrasoDestinoMin).toBe(62)
  })

  it('a recalibração feita pelo botão não leva a marca', () => {
    const eventos = [...base, ev.recalibracaoPelaLocalizacao('almoco', h('13:02'), h('11:40'), h('11:41'))]
    expect(etapaDe(calcularEstado(PLANO, original, eventos, h('11:41')), 'almoco').chegada?.automatica).toBeUndefined()
  })

  it('uma atualização do botão ou digitada depois substitui a automática, sem a marca', () => {
    const auto = ev.recalibracaoAutomatica('almoco', h('13:02'), h('11:40'), h('11:41'))
    const doBotao = [...base, auto, ev.recalibracaoPelaLocalizacao('almoco', h('13:10'), h('11:45'), h('11:46'))]
    const digitada = [...base, auto, ev.recalibracao('almoco', h('13:10'), h('11:46'))]
    expect(etapaDe(calcularEstado(PLANO, original, doBotao, h('11:46')), 'almoco').chegada?.automatica).toBeUndefined()
    expect(etapaDe(calcularEstado(PLANO, original, digitada, h('11:46')), 'almoco').chegada?.automatica).toBeUndefined()
  })

  it('a regra do relógio vale por cima, sem a marca', () => {
    const eventos = [...base, ev.recalibracaoAutomatica('almoco', h('12:00'), h('11:40'), h('11:41'))]
    const chegada = etapaDe(calcularEstado(PLANO, original, eventos, h('12:30')), 'almoco').chegada
    expect(chegada?.origem).toBe('relogio')
    expect(chegada?.automatica).toBeUndefined()
  })

  it('o plano original continua intacto', () => {
    const antes = JSON.stringify(original)
    calcularEstado(PLANO, original, [...base, ev.recalibracaoAutomatica('almoco', h('13:02'), h('11:40'), h('11:41'))], h('11:41'))
    expect(JSON.stringify(original)).toBe(antes)
  })
})

describe('atualização automática: backup formato 1', () => {
  const conteudo = (eventos: ConteudoBackup['eventos']): ConteudoBackup => ({
    viagens: [{ ...PLANO.viagem, planoOriginal: congelar() }],
    etapas: ETAPAS,
    locais: LOCAIS,
    trechos: [],
    eventos,
    passageiros: [],
    modelos: [],
  })
  const ida = async (eventos: ConteudoBackup['eventos']) => validarBackup(serializarBackup(await montarBackup(conteudo(eventos), h('12:00'))))

  it('guarda e lê a recalibração automática', async () => {
    const r = await ida([...EVENTOS_CASO_3, ev.recalibracaoAutomatica('almoco', h('13:02'), h('11:40'), h('11:41'))])
    expect(r.ok).toBe(true)
    if (r.ok) {
      const e = r.backup.conteudo.eventos.find((x) => x.tipo === 'recalibracao')
      expect(e?.tipo === 'recalibracao' && e.dados.automatica).toBe(true)
    }
  })

  it('lê os arquivos antigos, sem o campo', async () => {
    expect((await ida([...EVENTOS_CASO_3, ev.recalibracaoPelaLocalizacao('almoco', h('13:02'), h('11:40'), h('11:41'))])).ok).toBe(true)
  })

  it('recusa um valor inesperado em `automatica`', async () => {
    const ruim = { ...ev.recalibracao('almoco', h('13:02'), h('11:40')), dados: { horario: h('13:02'), automatica: 'sim' } } as never
    expect((await ida([...EVENTOS_CASO_3, ruim])).ok).toBe(false)
  })
})
