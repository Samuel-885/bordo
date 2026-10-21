// Conversão entre os campos "HH:MM" dos formulários e os horários completos com fuso.
// Os formulários só pedem a hora; a data vem da etapa anterior (ou da data de saída).

import { antes, diferencaMin, instante, naHoraDoDia, somarMinutos, truncarMinuto } from '../../core/tempo'
import { ordenarEtapas, saidaRoteiro } from '../../core/trechos'
import type { Etapa, HoraDoDia, Instante } from '../../core/tipos'

/** "HH:MM" do instante, no fuso -03:00. */
export function formatarHora(i: Instante): HoraDoDia {
  return truncarMinuto(i).slice(11, 16)
}

/** "AAAA-MM-DD" do instante, no fuso -03:00 (valor de um campo de data). */
export function formatarData(i: Instante): string {
  return truncarMinuto(i).slice(0, 10)
}

/** Quantos dias o instante está depois do dia de `base` (0 = no mesmo dia). */
export function diasDepois(i: Instante, base: Instante): number {
  return Math.round(diferencaMin(naHoraDoDia(i, '00:00'), naHoraDoDia(base, '00:00')) / (24 * 60))
}

/**
 * A hora, a partir de `referencia`: no mesmo dia dela, ou no dia seguinte se for
 * menor que a da referência. `viraDia` pede confirmação na tela ("+1 dia").
 */
export function resolverHora(hora: HoraDoDia, referencia: Instante): { instante: Instante; viraDia: boolean } {
  const mesmoDia = naHoraDoDia(referencia, hora)
  if (!antes(mesmoDia, referencia)) return { instante: mesmoDia, viraDia: false }
  return { instante: naHoraDoDia(referencia, hora, 1), viraDia: true }
}

/**
 * Janela da parada flexível, ancorada no dia da chegada da etapa (ou da referência
 * anterior). Fim menor que o início é no dia seguinte.
 */
export function resolverJanela(
  inicio: HoraDoDia,
  fim: HoraDoDia,
  ancora: Instante,
): { inicio: Instante; fim: Instante; atravessaMeiaNoite: boolean } {
  const ini = naHoraDoDia(ancora, inicio)
  const f = naHoraDoDia(ancora, fim)
  return antes(f, ini)
    ? { inicio: ini, fim: naHoraDoDia(ancora, fim, 1), atravessaMeiaNoite: true }
    : { inicio: ini, fim: f, atravessaMeiaNoite: false }
}

/** "AAAA-MM-DD" → meia-noite desse dia com fuso. */
export function dataParaInstante(data: string): Instante {
  return instante(`${data}T00:00:00-03:00`)
}

/**
 * De onde contar os horários de uma etapa: a saída do roteiro da etapa anterior mais
 * próxima que tenha horário; sem nenhuma, o começo do dia da saída da viagem.
 * `etapas` já está na ordem final e `indice` é a posição da etapa.
 */
export function referenciaAnterior(etapas: readonly Etapa[], indice: number, dataSaida: Instante): Instante {
  const lista = ordenarEtapas(etapas)
  for (let j = indice - 1; j >= 0; j--) {
    const saida = saidaRoteiro(lista[j]!)
    if (saida) return saida
  }
  return naHoraDoDia(dataSaida, '00:00')
}

export function somarDias(i: Instante, dias: number): Instante {
  return somarMinutos(i, dias * 24 * 60)
}
