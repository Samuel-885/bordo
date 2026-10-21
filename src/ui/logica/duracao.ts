// Duração de trechos e permanências em texto e em horas/minutos.

/** 115 → "1h55"; 180 → "3h00"; 45 → "45 min". */
export function formatarDuracao(minutos: number): string {
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`
}

/** Horas e minutos digitados → minutos. Vazio vale zero; inválido ou zero total é recusado. */
export function minutosDeHorasEMinutos(horas: string, minutos: string): number | null {
  const parte = (t: string): number | null => {
    const limpo = t.trim()
    if (limpo === '') return 0
    return /^\d{1,3}$/.test(limpo) ? Number(limpo) : null
  }
  const h = parte(horas)
  const m = parte(minutos)
  if (h === null || m === null || m > 59) return null
  const total = h * 60 + m
  return total > 0 ? total : null
}

export function horasEMinutosDe(total: number): { horas: string; minutos: string } {
  return { horas: String(Math.floor(total / 60)), minutos: String(total % 60) }
}
