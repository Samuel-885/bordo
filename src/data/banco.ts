// Bancos IndexedDB (Dexie). Dois bancos separados, com o mesmo esquema: um para os
// dados reais e outro só para a demonstração. Guardam apenas plano e eventos;
// estado derivado nunca é persistido.

import Dexie, { type Table } from 'dexie'
import type { Etapa, Evento, Local, Trecho, Viagem } from '../core/tipos'

export type Espaco = 'real' | 'demo'

export const NOME_DO_BANCO: Record<Espaco, string> = {
  real: 'bordo',
  demo: 'bordo-demo',
}

export class BancoBordo extends Dexie {
  viagens!: Table<Viagem, string>
  etapas!: Table<Etapa, string>
  locais!: Table<Local, string>
  trechos!: Table<Trecho, [string, string, string, string]>
  eventos!: Table<Evento, string>

  constructor(nome: string) {
    super(nome)
    this.version(1).stores({
      viagens: 'id, status',
      etapas: 'id, viagemId, [viagemId+ordem]',
      locais: 'id, cidade',
      trechos: '[etapaOrigemId+localOrigemId+etapaDestinoId+localDestinoId], etapaOrigemId, etapaDestinoId',
      eventos: 'id, viagemId, [viagemId+horarioFato]',
    })
  }
}
