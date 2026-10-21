import { afterEach, describe, expect, it } from 'vitest'
import { agora, simuladoAtivo } from '../../core/relogio'
import { diferencaMin } from '../../core/tempo'
import { cenarioPorId } from '../cenarios'
import { ETAPA, horaDemo } from '../dados'
import { SessaoDemo } from '../executor'
import { esperarHorario, etapaDe } from './ajudas'

let sessao: SessaoDemo | null = null
afterEach(() => {
  sessao?.encerrar()
  sessao = null
})

function nova(id: string): SessaoDemo {
  sessao = new SessaoDemo(cenarioPorId(id))
  return sessao
}

describe('executor: passos', () => {
  it('avança um passo por vez e informa o próximo', () => {
    const s = nova('saida-atrasada')
    expect(s.proximoPasso?.descricao).toBe('São 06:47 e o ônibus ainda não saiu.')
    expect(s.avancarPasso()).toBe(true)
    expect(s.passo).toBe(1)
    expect(diferencaMin(agora(), horaDemo('06:47'))).toBe(0)
    expect(s.avancarPasso()).toBe(true)
    expect(s.proximoPasso).toBeNull()
    expect(s.avancarPasso()).toBe(false)
    expect(s.passo).toBe(s.totalPassos)
  })

  it('executarAte só vai para a frente e respeita o total', () => {
    const s = nova('chegada-atrasada-monlevade')
    s.executarAte(2)
    expect(() => s.executarAte(1)).toThrow(RangeError)
    expect(() => s.executarAte(s.totalPassos + 1)).toThrow(RangeError)
    expect(s.passo).toBe(2)
  })

  it('encerrar volta ao relógio real', () => {
    const s = nova('saida-atrasada')
    expect(simuladoAtivo()).toBe(true)
    s.encerrar()
    expect(simuladoAtivo()).toBe(false)
  })
})

describe('executor: modo livre', () => {
  it('aceita um evento manual depois de qualquer passo e o cenário para de avançar', () => {
    const s = nova('chegada-ao-destino')
    s.executarAte(4) // saída 06:47, chegada em Monlevade 08:42
    const antes = s.passo
    expect(s.modoLivre).toBe(false)

    s.definirRelogio(horaDemo('08:50'))
    const r = s.registrarManual({ tipo: 'saida', etapaId: ETAPA.monlevade })
    expect(r.ok).toBe(true)
    expect(s.modoLivre).toBe(true)
    expect(s.proximoPasso).toBeNull()
    expect(s.avancarPasso()).toBe(false)
    expect(() => s.executarAte(antes + 1)).toThrow()
    expect(s.passo).toBe(antes)

    // continua à mão, com o relógio simulado
    s.avancarRelogio(60)
    expect(s.registrarManual({ tipo: 'chegada', etapaId: ETAPA.almoco }).ok).toBe(true)
    const e = s.estado()
    expect(etapaDe(e, ETAPA.monlevade).estado).toBe('concluida')
    expect(etapaDe(e, ETAPA.almoco).estado).toBe('em_parada')
    esperarHorario(etapaDe(e, ETAPA.almoco).chegada?.instante, horaDemo('09:50'))
    expect(s.eventos.at(-1)).toMatchObject({ tipo: 'chegada', etapaId: ETAPA.almoco, id: expect.stringMatching(/^demo-ev-/) })
  })

  it('o evento manual entra no horário do relógio simulado', () => {
    const s = nova('saida-atrasada')
    s.executarAte(1)
    const r = s.registrarManual({ tipo: 'saida', etapaId: ETAPA.origem })
    if (!r.ok) throw new Error(r.motivo)
    esperarHorario(r.evento.horarioFato, horaDemo('06:47'))
    esperarHorario(r.evento.registradoEm, horaDemo('06:47'))
  })

  it('reiniciar descarta os eventos manuais e sai do modo livre', () => {
    const s = nova('saida-atrasada')
    s.executarAte(1)
    s.registrarManual({ tipo: 'saida', etapaId: ETAPA.origem })
    s.registrarManual({ tipo: 'imprevisto', dados: { categoria: 'clima' } })
    expect(s.eventos).toHaveLength(3)

    s.reiniciar()
    expect(s.eventos.map((ev) => ev.tipo)).toEqual(['inicio'])
    expect(s.modoLivre).toBe(false)
    expect(s.proximoPasso).not.toBeNull()
    s.executarTudo()
    expect(s.eventos.map((ev) => ev.tipo)).toEqual(['inicio', 'saida'])
  })

  it('recusa recalibração no passado, sem registrar nem entrar em modo livre', () => {
    const s = nova('chegada-ao-destino')
    s.executarAte(6) // saída de Monlevade 08:57, em trânsito para o almoço
    s.definirRelogio(horaDemo('12:10'))
    const eventos = s.eventos.length
    const r = s.registrarManual({
      tipo: 'recalibracao',
      etapaId: ETAPA.almoco,
      dados: { horario: horaDemo('12:05') },
    })
    expect(r.ok).toBe(false)
    expect(s.eventos).toHaveLength(eventos)
    expect(s.modoLivre).toBe(false)
  })

  it('recusa pular etapa obrigatória', () => {
    const s = nova('saida-atrasada')
    const r = s.registrarManual({ tipo: 'pular_etapa', etapaId: ETAPA.monlevade })
    expect(r.ok).toBe(false)
    expect(s.modoLivre).toBe(false)
  })

  it('aceita pular uma parada flexível', () => {
    const s = nova('saida-atrasada')
    s.executarTudo()
    expect(s.registrarManual({ tipo: 'pular_etapa', etapaId: ETAPA.cafe }).ok).toBe(true)
    expect(etapaDe(s.estado(), ETAPA.cafe).estado).toBe('pulada')
  })
})
