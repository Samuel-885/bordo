import { BancoBordo } from '../banco'
import { Repositorio } from '../repositorio'
import type { Espaco } from '../banco'
import { usarRelogioReal, usarRelogioSimulado } from '../../core/relogio'
import { INICIO_DEMO } from '../semente-demo'
import { PLANO_DEMO } from '../../demo/dados'
import type { DadosPlano, Etapa } from '../../core/tipos'

let contador = 0

/** Repositório novo, com banco de nome único e o relógio do espaço ligado. */
export function repositorioDeTeste(espaco: Espaco): Repositorio {
  if (espaco === 'demo') usarRelogioSimulado(INICIO_DEMO)
  else usarRelogioReal()
  contador += 1
  return new Repositorio(new BancoBordo(`teste-${espaco}-${contador}`), espaco)
}

/** Plano fictício da demonstração, ainda em planejamento. */
export function planoParaPlanejar(): DadosPlano {
  return { ...PLANO_DEMO, viagem: { ...PLANO_DEMO.viagem, status: 'planejando', planoOriginal: null } }
}

export const idsDe = (etapas: Etapa[]) => etapas.map((e) => e.id)
