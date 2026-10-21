// Cenários da demonstração rodando no banco da demonstração, com o relógio simulado.
// Cada passo de registro passa pelo mesmo repositório e pelas mesmas travas da viagem
// real. O executor só guarda em que passo está: plano e eventos ficam no banco.

import { definirSimulado, avancarSimulado, usarRelogioSimulado } from '../core/relogio'
import { ErroDeEspaco, type Repositorio } from '../data/repositorio'
import { semearDemonstracao } from '../data/semente-demo'
import type { Cenario, Passo } from './cenarios'
import { VIAGEM_DEMO_ID } from './dados'

export class ExecutorNoBanco {
  readonly cenario: Cenario
  readonly #repo: Repositorio
  #passo = 0
  #livre = false

  private constructor(repo: Repositorio, cenario: Cenario) {
    this.#repo = repo
    this.cenario = cenario
  }

  /**
   * Reinicia o banco da demonstração, liga o relógio em `cenario.inicio` e inicia a
   * viagem de verdade (plano original congelado, evento "início").
   */
  static async iniciar(repo: Repositorio, cenario: Cenario): Promise<ExecutorNoBanco> {
    if (repo.espaco !== 'demo') throw new ErroDeEspaco('Os cenários só rodam no banco da demonstração.')
    usarRelogioSimulado(cenario.inicio)
    await semearDemonstracao(repo)
    const r = await repo.iniciarViagem(VIAGEM_DEMO_ID)
    if (!r.ok) throw new Error(`Não foi possível iniciar a viagem da demonstração (${r.motivo}).`)
    return new ExecutorNoBanco(repo, cenario)
  }

  get passo(): number {
    return this.#passo
  }

  get totalPassos(): number {
    return this.cenario.passos.length
  }

  /** Ligado pelo primeiro registro feito pelos botões da tela: o cenário não segue mais sozinho. */
  get modoLivre(): boolean {
    return this.#livre
  }

  get proximoPasso(): Passo | null {
    return this.#livre ? null : (this.cenario.passos[this.#passo] ?? null)
  }

  entrarNoModoLivre(): void {
    this.#livre = true
  }

  /** Roda o próximo passo. Falso se acabou ou se está em modo livre. */
  async avancarPasso(): Promise<boolean> {
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
        const c = passo.conteudo
        // A chegada no destino já grava o "fim" e conclui a viagem.
        if (c.tipo === 'fim') {
          if ((await this.#repo.obterViagem(VIAGEM_DEMO_ID))?.status === 'concluida') break
          throw new Error(`Passo inválido no cenário "${this.cenario.id}" (${passo.descricao}): a viagem ainda não chegou.`)
        }
        const r = await this.#repo.registrarEvento(VIAGEM_DEMO_ID, c)
        if (!r.ok) throw new Error(`Passo inválido no cenário "${this.cenario.id}" (${passo.descricao}): ${r.motivo}`)
        break
      }
    }
    this.#passo += 1
    return true
  }
}
