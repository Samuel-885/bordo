// Entrada nos espaços de dados. O relógio acompanha o espaço:
// - real: sempre o relógio real;
// - demonstração: sempre o relógio simulado, com o banco apagado e regravado.
// Assim nunca existe banco real com relógio simulado.

import { usarRelogioReal, usarRelogioSimulado } from '../core/relogio'
import { BancoBordo, NOME_DO_BANCO, type Espaco } from './banco'
import { Repositorio } from './repositorio'
import { INICIO_DEMO, semearDemonstracao } from './semente-demo'

const bancos = new Map<Espaco, BancoBordo>()

function repositorioDe(espaco: Espaco): Repositorio {
  let banco = bancos.get(espaco)
  if (!banco) {
    banco = new BancoBordo(NOME_DO_BANCO[espaco])
    bancos.set(espaco, banco)
  }
  return new Repositorio(banco, espaco)
}

/** Entra no espaço real: liga o relógio real antes de abrir o banco. */
export function entrarNoEspacoReal(): Repositorio {
  usarRelogioReal()
  return repositorioDe('real')
}

/**
 * Entra na demonstração, ou reinicia: liga o relógio simulado, apaga o banco da
 * demonstração e regrava o planejamento fictício. Nunca toca no banco real.
 */
export async function entrarNaDemonstracao(): Promise<Repositorio> {
  usarRelogioSimulado(INICIO_DEMO)
  const repo = repositorioDe('demo')
  await semearDemonstracao(repo)
  return repo
}

/** Sai da demonstração: o relógio volta ao real. */
export function sairDaDemonstracao(): void {
  usarRelogioReal()
}
