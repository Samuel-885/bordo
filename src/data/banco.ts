// Bancos IndexedDB (Dexie). Dois bancos separados, com o mesmo esquema: um para os
// dados reais e outro só para a demonstração. Guardam plano e eventos; estado derivado nunca
// é persistido. Única exceção: as consultas ao Google Maps (fase 6), que não são fato da
// viagem nem estado derivado, valem por pouco tempo e ficam fora do backup; e os modelos de
// mensagem (fase 7), configuração do app que entra no backup e sobrevive ao reinício da demonstração; e a
// tabela `meta` (fase 10a), configuração do aparelho (último backup, aviso de restauração) que fica fora do backup.

import Dexie, { type Table } from 'dexie'
import { avisarBanco, type AvisoDoBanco } from './avisoBanco'
import type { Consulta, Etapa, Evento, LinhaMeta, Local, ModeloSalvo, Passageiro, Trecho, Viagem } from '../core/tipos'

export type Espaco = 'real' | 'demo'

export const NOME_DO_BANCO: Record<Espaco, string> = {
  real: 'bordo',
  demo: 'bordo-demo',
}

/**
 * App aberto em mais de um lugar: se outra conexão quer subir a versão do banco, esta se
 * fecha sozinha e avisa "atualizado"; se esta é que tenta abrir uma versão nova e outra
 * conexão a segura, avisa "bloqueado" até a abertura seguir.
 */
export function ligarAvisosDeConexao(db: Dexie, avisar: (aviso: AvisoDoBanco | null) => void = avisarBanco): void {
  db.on('versionchange', () => {
    db.close()
    avisar('atualizado')
    return false
  })
  db.on('blocked', () => avisar('bloqueado'))
  db.on('ready', () => {
    avisar(null)
  })
}

export class BancoBordo extends Dexie {
  viagens!: Table<Viagem, string>
  etapas!: Table<Etapa, string>
  locais!: Table<Local, string>
  trechos!: Table<Trecho, [string, string, string, string]>
  eventos!: Table<Evento, string>
  passageiros!: Table<Passageiro, string>
  consultas!: Table<Consulta, [string, string, string]>
  modelos!: Table<ModeloSalvo, string>
  meta!: Table<LinhaMeta, string>

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
    // Fase 6: só adiciona a tabela das consultas ao Google Maps (mesma regra da versão 2).
    this.version(3).stores({
      consultas: '[viagemId+etapaId+localId], viagemId',
    })
    // Fase 7: só adiciona a tabela dos modelos de mensagem (mesma regra das versões 2 e 3).
    this.version(4).stores({
      modelos: 'id',
    })
    // Fase 10a: só adiciona a tabela de configuração do aparelho (mesma regra das versões 2 a 4).
    this.version(5).stores({
      meta: 'chave',
    })
    ligarAvisosDeConexao(this)
  }
}
