// Semente da demonstração: o mesmo planejamento da viagem fictícia, só que ainda
// em "planejando" e sem plano original, para ser aberto nas telas de planejamento.
// Só mexe no repositório que recebe, que precisa ser o da demonstração.

import { ETAPA, horaDemo, PLANO_DEMO } from '../demo/dados'
import type { DadosPlano } from '../core/tipos'
import { ErroDeEspaco, type Repositorio } from './repositorio'

/** Onde o relógio simulado começa ao abrir a demonstração: antes da saída das 06:30. */
export const INICIO_DEMO = horaDemo('06:00')

/** Categoria e motivo que o formulário de etapa pede e que os dados da fase 2 não têm. */
const DETALHES: Record<string, { categoria?: string; motivo?: string }> = {
  [ETAPA.monlevade]: { motivo: 'buscar_passageiros' },
  [ETAPA.almoco]: { categoria: 'almoco' },
  [ETAPA.cafe]: { categoria: 'cafe' },
  [ETAPA.jantar]: { categoria: 'jantar' },
}

export function planoDeDemonstracaoParaPlanejar(): DadosPlano {
  return {
    ...PLANO_DEMO,
    viagem: { ...PLANO_DEMO.viagem, status: 'planejando', planoOriginal: null },
    etapas: PLANO_DEMO.etapas.map((e) => ({ ...e, ...DETALHES[e.id] })),
  }
}

/** Apaga o banco da demonstração e grava o planejamento fictício. */
export async function semearDemonstracao(repo: Repositorio): Promise<void> {
  if (repo.espaco !== 'demo') throw new ErroDeEspaco('A semente da demonstração só vale para o banco da demonstração.')
  await repo.limparTudo()
  await repo.gravarPlano(planoDeDemonstracaoParaPlanejar())
}
