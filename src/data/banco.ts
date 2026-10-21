// Bancos IndexedDB (Dexie). Dois bancos separados, com o mesmo esquema: um para os
// dados reais e outro só para a demonstração. Guardam apenas plano e eventos;
// estado derivado nunca é persistido.

import Dexie, { type Table } from 'dexie'
import type { Etapa, Evento, Local, Passageiro, Trecho, Viagem } from '../core/tipos'

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
  passageiros!: Table<Passageiro, string>

  constructor(nome: string) {
    super(nome)
    this.version(1).stores({
      viagens: 'id, status',
      etapas: 'id, viagemId, [viagemId+ordem]',
      locais: 'id, cidade',
      trechos: '[etapaOrigemId+localOrigemId+etapaDestinoId+localDestinoId], etapaOrigemId, etapaDestinoId',
      eventos: 'id, viagemId, [viagemId+horarioFato]',
    })
    // Fase 5: só adiciona a tabela de passageiros. As demais não mudam e nenhuma linha é
    // reescrita, então os dados que já estão nos celulares continuam como estavam.
    this.version(2).stores({
      passageiros: 'id, viagemId',
    })
  }
}
