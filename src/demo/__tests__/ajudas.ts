import { expect } from 'vitest'
import { diferencaMin } from '../../core/tempo'
import type { EstadoEtapa, EstadoViagem, Instante } from '../../core/tipos'

export function etapaDe(estado: EstadoViagem, etapaId: string): EstadoEtapa {
  const e = estado.etapas.find((x) => x.etapaId === etapaId)
  if (!e) throw new Error(`Etapa ausente no estado: ${etapaId}`)
  return e
}

/** Compara horários pelo valor numérico, mostrando o horário obtido se falhar. */
export function esperarHorario(obtido: Instante | null | undefined, esperado: Instante): void {
  expect(obtido, `esperado ${esperado}`).toBeTruthy()
  expect({ obtido, diferencaMin: diferencaMin(obtido!, esperado) }).toEqual({ obtido, diferencaMin: 0 })
}
