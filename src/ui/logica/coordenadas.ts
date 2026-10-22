// Coordenadas coladas como texto "lat, lng" (por exemplo, copiadas do Google Maps).

export type ResultadoCoordenadas =
  | { ok: true; coordenadas: { lat: number; lng: number } }
  | { ok: false; motivo: string }

const NUMERO = /^[+-]?\d+(\.\d+)?$/
const FORMATO = 'Cole as coordenadas no formato "latitude, longitude", por exemplo -19.4687, -42.5367, ou um link do Google Maps.'

function validar(lat: number, lng: number): ResultadoCoordenadas {
  if (lat < -90 || lat > 90) return { ok: false, motivo: 'A latitude precisa estar entre -90 e 90.' }
  if (lng < -180 || lng > 180) return { ok: false, motivo: 'A longitude precisa estar entre -180 e 180.' }
  return { ok: true, coordenadas: { lat, lng } }
}

const N = '([+-]?\\d+(?:\\.\\d+)?)'
/** Onde um link do Google Maps guarda as coordenadas: "@lat,lng", "?q=lat,lng" (e parecidos) e "!3dlat!4dlng". */
const NO_LINK = [
  new RegExp(`!3d${N}!4d${N}`),
  new RegExp(`@${N},\\s*${N}`),
  new RegExp(`[?&](?:q|query|ll|destination|center)=${N},\\s*${N}`),
]

function lerLink(link: string): ResultadoCoordenadas {
  let texto = link
  try {
    texto = decodeURIComponent(link)
  } catch {
    // Link com "%" solto: lê como está.
  }
  for (const padrao of NO_LINK) {
    const m = padrao.exec(texto)
    if (m) return validar(Number(m[1]), Number(m[2]))
  }
  return { ok: false, motivo: 'Esse link não traz as coordenadas. Abra o local no Google Maps, copie o link da barra de endereço (ou as coordenadas) e cole aqui.' }
}

/**
 * Lê "lat, lng" com ou sem espaços (no início, no fim e ao redor da vírgula), com pontuação solta
 * no fim (ponto, ponto e vírgula, vírgula) e links do Google Maps com as coordenadas.
 */
export function lerCoordenadas(texto: string): ResultadoCoordenadas {
  const aparado = texto.trim()
  if (/^https?:\/\//i.test(aparado)) return lerLink(aparado)
  const limpo = aparado
    .replace(/−/g, '-')
    .replace(/[\s.;,]+$/, '')
    .replace(/^\(|\)$/g, '')
    .trim()
  const partes = limpo.split(/\s*[;,]\s*|\s+/).filter((p) => p !== '')
  if (partes.length !== 2 || !partes.every((p) => NUMERO.test(p))) return { ok: false, motivo: FORMATO }
  return validar(Number(partes[0]), Number(partes[1]))
}

export function formatarCoordenadas(c: { lat: number; lng: number }): string {
  return `${c.lat}, ${c.lng}`
}
