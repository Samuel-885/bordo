import { describe, expect, it } from 'vitest'
import { etiquetaDaEtapa } from '../rotulos'
import { nomeDaEtapa, resumoDaEtapa, textoDoBloqueio } from '../textos'
import { PLANO_DEMO } from '../../../demo/dados'

const demo = (id: string) => PLANO_DEMO.etapas.find((e) => e.id === id)!

describe('textos das etapas', () => {
  it('etiquetas', () => {
    expect(etiquetaDaEtapa('origem', undefined)).toBe('ORIGEM')
    expect(etiquetaDaEtapa('obrigatoria', undefined)).toBe('OBRIGATÓRIO')
    expect(etiquetaDaEtapa('flexivel', 'almoco')).toBe('ALMOÇO · FLEXÍVEL')
    expect(etiquetaDaEtapa('destino', undefined)).toBe('DESTINO')
  })

  it('resumo: obrigatório mostra motivo e permanência; flexível, janela, permanência e alternativas', () => {
    expect(resumoDaEtapa({ ...demo('demo-monlevade'), motivo: 'buscar_passageiros' })).toBe('Buscar passageiros · 15 min')
    const almoco = { ...demo('demo-almoco'), janelaInicio: demo('demo-almoco').chegadaRoteiro!, janelaFim: demo('demo-cafe').chegadaRoteiro! }
    expect(resumoDaEtapa(almoco)).toBe('janela 12:00–16:00 · 1h00 · 3 alternativas')
    expect(resumoDaEtapa(demo('demo-cafe'))).toBe('sem janela · 30 min · 1 alternativa')
  })

  it('bloqueio de trecho cita a etapa', () => {
    const etapas = PLANO_DEMO.etapas.map((e) => (e.id === 'demo-cafe' ? { ...e, categoria: 'cafe' } : e))
    expect(textoDoBloqueio({ tipo: 'trecho_sem_tempo', etapaDestinoId: 'demo-cafe' }, etapas, PLANO_DEMO.locais)).toBe(
      'O trecho até "Café" está sem tempo definido.',
    )
    expect(nomeDaEtapa(demo('demo-origem'), PLANO_DEMO.locais)).toBe('Origem (Ponto de saída)')
  })
})
