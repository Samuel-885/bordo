import { describe, expect, it } from 'vitest'
import { criarEvento } from '../../../core/eventos'
import { ETAPA, horaDemo, LOCAL, PLANO_DEMO } from '../../../demo/dados'
import { nomeDaEtapaEmUso } from '../textosViagem'

describe('nome da etapa com o local em uso', () => {
  const troca = (id: string, sequencia: number, localId: string) =>
    criarEvento(
      { id, viagemId: PLANO_DEMO.viagem.id, horarioFato: horaDemo('10:57'), registradoEm: horaDemo('10:57'), sequencia },
      { tipo: 'troca_local', etapaId: ETAPA.almoco, dados: { localId } },
    )
  const etapa = PLANO_DEMO.etapas.find((e) => e.id === ETAPA.almoco)

  it('duas trocas no mesmo minuto: vale a última gravada, em qualquer ordem da lista', () => {
    const c = troca('zzz', 1, LOCAL.restC)
    const a = troca('aaa', 2, LOCAL.restA)
    expect(nomeDaEtapaEmUso(etapa, PLANO_DEMO.locais, [c, a])).toContain('Restaurante A')
    expect(nomeDaEtapaEmUso(etapa, PLANO_DEMO.locais, [a, c])).toContain('Restaurante A')
  })
})
