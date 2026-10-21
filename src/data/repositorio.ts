// Operações de leitura e escrita do planejamento. Um repositório pertence a um
// espaço (real ou demonstração) e se recusa a trabalhar se o relógio não for o do
// espaço: nunca pode existir banco real com relógio simulado.

import { criarEvento } from '../core/eventos'
import { moverEtapa, normalizarOrdem, paresVizinhos } from '../core/ordem'
import { calcularPlanoOriginal, type BloqueioInicio } from '../core/previsao'
import { agora, simuladoAtivo } from '../core/relogio'
import { diferencaMin, naHoraDoDia, somarMinutos } from '../core/tempo'
import type { DadosPlano, Etapa, Local, Trecho, Viagem } from '../core/tipos'
import type { BancoBordo, Espaco } from './banco'

export type ResultadoInicio =
  | { ok: true; viagem: Viagem }
  | { ok: false; motivo: 'nao_planejando' | 'viagem_inexistente' }
  | { ok: false; motivo: 'bloqueios'; bloqueios: BloqueioInicio[] }

export class ErroDeEspaco extends Error {}
export class EdicaoBloqueada extends Error {}
export class LocalEmUso extends Error {}

export function novoId(): string {
  return crypto.randomUUID()
}

const chaveTrecho = (t: Pick<Trecho, 'etapaOrigemId' | 'localOrigemId' | 'etapaDestinoId' | 'localDestinoId'>) =>
  [t.etapaOrigemId, t.localOrigemId, t.etapaDestinoId, t.localDestinoId] as [string, string, string, string]

export class Repositorio {
  readonly espaco: Espaco
  readonly #db: BancoBordo

  constructor(db: BancoBordo, espaco: Espaco) {
    this.#db = db
    this.espaco = espaco
  }

  /** O espaço real só roda com o relógio real; a demonstração, só com o simulado. */
  #exigirRelogioDoEspaco(): void {
    if (this.espaco === 'real' && simuladoAtivo()) {
      throw new ErroDeEspaco('O banco real não pode ser usado com o relógio simulado ligado.')
    }
    if (this.espaco === 'demo' && !simuladoAtivo()) {
      throw new ErroDeEspaco('O banco da demonstração só pode ser usado com o relógio simulado ligado.')
    }
  }

  // ---------- Viagens ----------

  async listarViagens(): Promise<Viagem[]> {
    this.#exigirRelogioDoEspaco()
    return this.#db.viagens.toArray()
  }

  async obterViagem(id: string): Promise<Viagem | undefined> {
    this.#exigirRelogioDoEspaco()
    return this.#db.viagens.get(id)
  }

  /**
   * Cria ou atualiza os dados da viagem. Depois de iniciada, só o nome pode mudar.
   * Mudar a data de saída desloca junto os horários já gravados das etapas.
   */
  async salvarViagem(viagem: Viagem): Promise<void> {
    this.#exigirRelogioDoEspaco()
    const { viagens, etapas } = this.#db
    await this.#db.transaction('rw', viagens, etapas, async () => {
      const atual = await viagens.get(viagem.id)
      if (atual && atual.status !== 'planejando') {
        // Plano original e status nunca são alterados por aqui.
        await viagens.put({ ...atual, nome: viagem.nome })
        return
      }
      if (atual) {
        const dias = Math.round(
          diferencaMin(naHoraDoDia(viagem.dataSaida, '00:00'), naHoraDoDia(atual.dataSaida, '00:00')) / (24 * 60),
        )
        if (dias !== 0) {
          const minutos = dias * 24 * 60
          const deslocar = <T extends Etapa['chegadaRoteiro']>(i: T) => (i ? (somarMinutos(i, minutos) as T) : i)
          const lista = await etapas.where('viagemId').equals(viagem.id).toArray()
          await etapas.bulkPut(
            lista.map((e) => ({
              ...e,
              chegadaRoteiro: deslocar(e.chegadaRoteiro),
              janelaInicio: deslocar(e.janelaInicio),
              janelaFim: deslocar(e.janelaFim),
            })),
          )
        }
      }
      await viagens.put({ ...viagem, status: 'planejando', planoOriginal: null })
    })
  }

  /** Remove a viagem com etapas, trechos e eventos. Os locais (catálogo) ficam. */
  async excluirViagem(id: string): Promise<void> {
    this.#exigirRelogioDoEspaco()
    const { viagens, etapas, trechos, eventos } = this.#db
    await this.#db.transaction('rw', viagens, etapas, trechos, eventos, async () => {
      const ids = (await etapas.where('viagemId').equals(id).primaryKeys()) as string[]
      await trechos.where('etapaOrigemId').anyOf(ids).delete()
      await trechos.where('etapaDestinoId').anyOf(ids).delete()
      await etapas.where('viagemId').equals(id).delete()
      await eventos.where('viagemId').equals(id).delete()
      await viagens.delete(id)
    })
  }

  // ---------- Etapas ----------

  async listarEtapas(viagemId: string): Promise<Etapa[]> {
    this.#exigirRelogioDoEspaco()
    return normalizarOrdem(await this.#db.etapas.where('viagemId').equals(viagemId).toArray())
  }

  /**
   * Grava a etapa. Etapa nova entra no fim do meio (antes do destino). Renumera a
   * ordem e apaga trechos que deixaram de fazer sentido. Só com a viagem planejando.
   */
  async salvarEtapa(etapa: Etapa): Promise<void> {
    this.#exigirRelogioDoEspaco()
    const { viagens, etapas, trechos } = this.#db
    await this.#db.transaction('rw', viagens, etapas, trechos, async () => {
      await this.#exigirPlanejando(etapa.viagemId)
      const existentes = await etapas.where('viagemId').equals(etapa.viagemId).toArray()
      const ja = existentes.find((e) => e.id === etapa.id)
      const ordem = ja ? ja.ordem : Math.max(0, ...existentes.map((e) => e.ordem)) + 1
      const lista = normalizarOrdem([...existentes.filter((e) => e.id !== etapa.id), { ...etapa, ordem }])
      await etapas.bulkPut(lista)
      await this.#limparTrechosOrfaos(etapa.viagemId)
    })
  }

  async excluirEtapa(etapaId: string): Promise<void> {
    this.#exigirRelogioDoEspaco()
    const { viagens, etapas, trechos } = this.#db
    await this.#db.transaction('rw', viagens, etapas, trechos, async () => {
      const etapa = await etapas.get(etapaId)
      if (!etapa) return
      await this.#exigirPlanejando(etapa.viagemId)
      await etapas.delete(etapaId)
      const restantes = await etapas.where('viagemId').equals(etapa.viagemId).toArray()
      await etapas.bulkPut(normalizarOrdem(restantes))
      await this.#limparTrechosOrfaos(etapa.viagemId)
    })
  }

  async moverEtapa(etapaId: string, sentido: 'subir' | 'descer'): Promise<void> {
    this.#exigirRelogioDoEspaco()
    const { viagens, etapas, trechos } = this.#db
    await this.#db.transaction('rw', viagens, etapas, trechos, async () => {
      const etapa = await etapas.get(etapaId)
      if (!etapa) return
      await this.#exigirPlanejando(etapa.viagemId)
      const todas = await etapas.where('viagemId').equals(etapa.viagemId).toArray()
      await etapas.bulkPut(moverEtapa(todas, etapaId, sentido))
      await this.#limparTrechosOrfaos(etapa.viagemId)
    })
  }

  // ---------- Locais (catálogo) ----------

  async listarLocais(): Promise<Local[]> {
    this.#exigirRelogioDoEspaco()
    return this.#db.locais.toArray()
  }

  async salvarLocal(local: Local): Promise<void> {
    this.#exigirRelogioDoEspaco()
    await this.#db.locais.put(local)
  }

  /** Um local que alguma etapa usa não pode ser excluído. */
  async excluirLocal(id: string): Promise<void> {
    this.#exigirRelogioDoEspaco()
    const { locais, etapas } = this.#db
    await this.#db.transaction('rw', locais, etapas, async () => {
      const emUso = await etapas.filter((e) => e.localId === id || e.alternativas.includes(id)).count()
      if (emUso > 0) throw new LocalEmUso('Este local é usado em uma etapa.')
      await locais.delete(id)
    })
  }

  // ---------- Trechos ----------

  async listarTrechos(viagemId: string): Promise<Trecho[]> {
    this.#exigirRelogioDoEspaco()
    const ids = (await this.#db.etapas.where('viagemId').equals(viagemId).primaryKeys()) as string[]
    return this.#db.trechos.where('etapaOrigemId').anyOf(ids).toArray()
  }

  /** Duração digitada à mão (fonte "manual"). Substitui o trecho do mesmo par de locais. */
  async salvarTrechoManual(
    viagemId: string,
    par: Pick<Trecho, 'etapaOrigemId' | 'localOrigemId' | 'etapaDestinoId' | 'localDestinoId'>,
    duracaoMin: number,
  ): Promise<void> {
    this.#exigirRelogioDoEspaco()
    if (!Number.isInteger(duracaoMin) || duracaoMin <= 0) throw new RangeError('A duração precisa ser de pelo menos 1 minuto.')
    const { viagens, trechos } = this.#db
    await this.#db.transaction('rw', viagens, trechos, async () => {
      await this.#exigirPlanejando(viagemId)
      await trechos.put({ ...par, duracaoMin, fonte: 'manual' })
    })
  }

  async removerTrecho(
    viagemId: string,
    par: Pick<Trecho, 'etapaOrigemId' | 'localOrigemId' | 'etapaDestinoId' | 'localDestinoId'>,
  ): Promise<void> {
    this.#exigirRelogioDoEspaco()
    const { viagens, trechos } = this.#db
    await this.#db.transaction('rw', viagens, trechos, async () => {
      await this.#exigirPlanejando(viagemId)
      await trechos.delete(chaveTrecho(par))
    })
  }

  // ---------- Plano e início ----------

  /** Tudo o que o núcleo precisa do planejamento. */
  async carregarPlano(viagemId: string): Promise<DadosPlano | null> {
    this.#exigirRelogioDoEspaco()
    const viagem = await this.#db.viagens.get(viagemId)
    if (!viagem) return null
    const [etapas, locais, trechos] = await Promise.all([
      this.listarEtapas(viagemId),
      this.listarLocais(),
      this.listarTrechos(viagemId),
    ])
    return { viagem, etapas, locais, trechos }
  }

  /**
   * Congela o planejamento: calcula o plano original, grava, muda o status para
   * "em andamento" e registra o evento "início". Tudo ou nada, numa só transação.
   */
  async iniciarViagem(viagemId: string): Promise<ResultadoInicio> {
    this.#exigirRelogioDoEspaco()
    const { viagens, etapas, locais, trechos, eventos } = this.#db
    return this.#db.transaction('rw', viagens, etapas, locais, trechos, eventos, async (): Promise<ResultadoInicio> => {
      const viagem = await viagens.get(viagemId)
      if (!viagem) return { ok: false, motivo: 'viagem_inexistente' }
      if (viagem.status !== 'planejando') return { ok: false, motivo: 'nao_planejando' }

      const dados = await this.carregarPlano(viagemId)
      const momento = agora()
      const calculo = calcularPlanoOriginal(dados!, momento)
      if (!calculo.ok) return { ok: false, motivo: 'bloqueios', bloqueios: calculo.bloqueios }

      const iniciada: Viagem = { ...viagem, status: 'em_andamento', planoOriginal: calculo.plano }
      await viagens.put(iniciada)
      await eventos.add(criarEvento({ id: novoId(), viagemId, horarioFato: momento, registradoEm: momento }, { tipo: 'inicio' }))
      return { ok: true, viagem: iniciada }
    })
  }

  // ---------- Limpeza ----------

  /** Esvazia o banco deste espaço (usado ao reiniciar a demonstração). */
  async limparTudo(): Promise<void> {
    this.#exigirRelogioDoEspaco()
    const { viagens, etapas, locais, trechos, eventos } = this.#db
    await this.#db.transaction('rw', viagens, etapas, locais, trechos, eventos, async () => {
      await Promise.all([viagens.clear(), etapas.clear(), locais.clear(), trechos.clear(), eventos.clear()])
    })
  }

  /** Grava um plano completo de uma vez (semente da demonstração). */
  async gravarPlano(dados: DadosPlano): Promise<void> {
    this.#exigirRelogioDoEspaco()
    const { viagens, etapas, locais, trechos } = this.#db
    await this.#db.transaction('rw', viagens, etapas, locais, trechos, async () => {
      await viagens.put(dados.viagem)
      await etapas.bulkPut(dados.etapas)
      await locais.bulkPut(dados.locais)
      await trechos.bulkPut(dados.trechos)
    })
  }

  // ---------- Internos ----------

  async #exigirPlanejando(viagemId: string): Promise<void> {
    const viagem = await this.#db.viagens.get(viagemId)
    if (!viagem) throw new EdicaoBloqueada('Viagem não encontrada.')
    if (viagem.status !== 'planejando') {
      throw new EdicaoBloqueada('A viagem já foi iniciada: o planejamento não pode mais ser editado.')
    }
  }

  /** Trechos só existem entre etapas vizinhas e entre locais que ainda são candidatos. */
  async #limparTrechosOrfaos(viagemId: string): Promise<void> {
    const { etapas, trechos } = this.#db
    const lista = await etapas.where('viagemId').equals(viagemId).toArray()
    const vizinhas = new Set(paresVizinhos(lista).map(([a, b]) => `${a.id}>${b.id}`))
    const candidatos = new Map(
      lista.map((e) => [e.id, new Set([...(e.localId ? [e.localId] : []), ...e.alternativas])]),
    )
    const existentes = await trechos.where('etapaOrigemId').anyOf(lista.map((e) => e.id)).toArray()
    const remover = existentes.filter(
      (t) =>
        !vizinhas.has(`${t.etapaOrigemId}>${t.etapaDestinoId}`) ||
        !candidatos.get(t.etapaOrigemId)?.has(t.localOrigemId) ||
        !candidatos.get(t.etapaDestinoId)?.has(t.localDestinoId),
    )
    await trechos.bulkDelete(remover.map(chaveTrecho))
  }
}
