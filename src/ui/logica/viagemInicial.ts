// Ao abrir o app no espaço real: com exatamente uma viagem em andamento, vai direto
// para a tela principal dela. Com nenhuma ou mais de uma, abre a lista.

import type { Viagem } from '../../core/tipos'

export function viagemParaAbrirDireto(viagens: readonly Viagem[]): Viagem | null {
  const emAndamento = viagens.filter((v) => v.status === 'em_andamento')
  return emAndamento.length === 1 ? emAndamento[0]! : null
}
