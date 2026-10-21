// Coordenadas coladas como texto "lat, lng" (por exemplo, copiadas do Google Maps).

export type ResultadoCoordenadas =
  | { ok: true; coordenadas: { lat: number; lng: number } }
  | { ok: false; motivo: string }

const NUMERO = /^[+-]?\d+(\.\d+)?$/

export function lerCoordenadas(texto: string): ResultadoCoordenadas {
  const limpo = texto.trim().replace(/^\(|\)$/g, '').replace(/−/g, '-')
  const partes = limpo.split(/\s*[;,]\s*|\s+/).filter((p) => p !== '')
  if (partes.length !== 2 || !partes.every((p) => NUMERO.test(p))) {
    return { ok: false, motivo: 'Cole as coordenadas no formato "latitude, longitude", por exemplo -19.4687, -42.5367.' }
  }
  const lat = Number(partes[0])
  const lng = Number(partes[1])
  if (lat < -90 || lat > 90) return { ok: false, motivo: 'A latitude precisa estar entre -90 e 90.' }
  if (lng < -180 || lng > 180) return { ok: false, motivo: 'A longitude precisa estar entre -180 e 180.' }
  return { ok: true, coordenadas: { lat, lng } }
}

export function formatarCoordenadas(c: { lat: number; lng: number }): string {
  return `${c.lat}, ${c.lng}`
}
