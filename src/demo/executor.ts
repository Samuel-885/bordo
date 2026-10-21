// Executor dos cenários da demonstração. Liga o relógio simulado, aplica os passos
// de um cenário e aceita eventos manuais depois de qualquer passo (modo livre).
// Só guarda plano e eventos: o estado é sempre recalculado pelo núcleo.
//
// O relógio simulado é único no app: use uma sessão por vez e chame encerrar() ao sair
// da demonstração, para o app voltar ao relógio real.

import type { ConteudoEvento } from '../core/eventos'
import { criarEvento } from '../core/eventos'
import { calcularEstado, calcularPlanoOriginal, validarPulo } from '../core/previsao'
import { validarRecalibracao } from '../core/recalibracao'
import {
  agora,
  avancarSimulado,
  definirSimulado,
  usarRelogioReal,
  usarRelogioSimulado,
  type PassoRelogio,
} from '../core/relogio'
import type { EstadoViagem, Evento, Instante, PlanoOriginal } from '../core/tipos'
import type { Cenario, Passo } from './cenarios'
import { ESPACO_DEMO, PASSAGEIROS_DEMO, PLANO_DEMO, VIAGEM_DEMO_ID } from './dados'

export type ResultadoRegistro = { ok: true; evento: Evento } | { ok: false; motivo: string }

export class SessaoDemo {
  readonly cenario: Cenario
  readonly dados = PLANO_DEMO
  readonly passageiros = PASSAGEIROS_DEMO

  #original!: PlanoOriginal
  #eventos: Evento[] = []
  #passo = 0
  #livre = false
  #sequencia = 0

  constructor(cenario: Cenario) {
    this.cenario = cenario
    this.reiniciar()
  }

  /** Volta ao início do cenário: relógio, plano original e eventos (inclusive os manuais). */
  reiniciar(): void {
    usarRelogioSimulado(this.cenario.inicio)
    const calculo = calcularPlanoOriginal(this.dados, agora())
    if (!calculo.ok) throw new Error(`Plano da demonstração não calculável: ${JSON.stringify(calculo.bloqueios)}`)
    this.#original = calculo.plano
    this.#eventos = []
    this.#passo = 0
    this.#livre = false
    this.#sequencia = 0
    this.#adicionar({ tipo: 'inicio' })
  }

  /** Sai da demonstração: o app volta ao relógio real. */
  encerrar(): void {
    usarRelogioReal()
  }

  // ---------- Leitura ----------

  /** Quantos passos do cenário já rodaram. */
  get passo(): number {
    return this.#passo
  }

  get totalPassos(): number {
    return this.cenario.passos.length
  }

  /** Verdadeiro depois do primeiro evento manual: o cenário não segue mais sozinho. */
  get modoLivre(): boolean {
    return this.#livre
  }

  get proximoPasso(): Passo | null {
    return this.#livre ? null : (this.cenario.passos[this.#passo] ?? null)
  }

  get original(): PlanoOriginal {
    return this.#original
  }

  get eventos(): readonly Evento[] {
    return this.#eventos
  }

  /** Estado recalculado pelo núcleo para o horário atual do relógio simulado. */
  estado(): EstadoViagem {
    return calcularEstado(this.dados, this.#original, this.#eventos, agora())
  }

  // ---------- Passos do cenário ----------

  /** Roda o próximo passo. Falso se o cenário acabou ou se já está em modo livre. */
  avancarPasso(): boolean {
    const passo = this.proximoPasso
    if (!passo) return false
    switch (passo.tipo) {
      case 'definir_relogio':
        definirSimulado(passo.horario)
        break
      case 'avancar':
        avancarSimulado(passo.minutos)
        break
      case 'registrar': {
        const r = this.#registrar(passo.conteudo)
        if (!r.ok) throw new Error(`Passo inválido no cenário "${this.cenario.id}" (${passo.descricao}): ${r.motivo}`)
        break
      }
    }
    this.#passo += 1
    return true
  }

  /** Roda os passos até `passo` terem rodado. Só para a frente: para voltar, reiniciar(). */
  executarAte(passo: number): void {
    if (passo < this.#passo || passo > this.totalPassos) {
      throw new RangeError(`Passo ${passo} inválido (já rodaram ${this.#passo} de ${this.totalPassos}).`)
    }
    while (this.#passo < passo) {
      if (!this.avancarPasso()) throw new Error('Em modo livre o cenário não avança mais.')
    }
  }

  executarTudo(): void {
    this.executarAte(this.totalPassos)
  }

  // ---------- Modo livre ----------

  /** Registra um evento à mão, no horário atual, depois de qualquer passo. Liga o modo livre. */
  registrarManual(conteudo: ConteudoEvento): ResultadoRegistro {
    const r = this.#registrar(conteudo)
    if (r.ok) this.#livre = true
    return r
  }

  avancarRelogio(minutos: PassoRelogio): void {
    avancarSimulado(minutos)
  }

  definirRelogio(horario: Instante): void {
    definirSimulado(horario)
  }

  // ---------- Internos ----------

  #registrar(conteudo: ConteudoEvento): ResultadoRegistro {
    const agoraDoRelogio = agora()
    if (conteudo.tipo === 'recalibracao') {
      const v = validarRecalibracao(
        this.dados,
        this.#original,
        this.#eventos,
        conteudo.etapaId,
        conteudo.dados.horario,
        agoraDoRelogio,
      )
      if (!v.ok) return v
    }
    if (conteudo.tipo === 'pular_etapa') {
      const v = validarPulo(this.dados, this.estado(), conteudo.etapaId)
      if (!v.ok) return v
    }
    return { ok: true, evento: this.#adicionar(conteudo) }
  }

  #adicionar(conteudo: ConteudoEvento): Evento {
    this.#sequencia += 1
    const horario = agora()
    const evento = criarEvento(
      { id: `${ESPACO_DEMO}ev-${this.#sequencia}`, viagemId: VIAGEM_DEMO_ID, horarioFato: horario, registradoEm: horario },
      conteudo,
    )
    this.#eventos.push(evento)
    return evento
  }
}
