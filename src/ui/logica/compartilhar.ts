// Copiar e compartilhar o texto de uma mensagem. Recebem o navegador como argumento para
// poderem ser testados com um `navigator` simulado.

export type NavegadorParaTexto = Pick<Navigator, 'clipboard' | 'share'> & { onLine?: boolean }

/** Link do WhatsApp com o texto pronto (usado quando o navegador não tem o menu de compartilhar). */
export function linkDoWhatsApp(texto: string): string {
  return `https://wa.me/?text=${encodeURIComponent(texto)}`
}

/** Cópia pela `textarea` escondida, para quando a área de transferência moderna recusa. */
function copiarPelaTextarea(texto: string, doc: Document): boolean {
  const campo = doc.createElement('textarea')
  campo.value = texto
  campo.setAttribute('readonly', '')
  campo.style.position = 'fixed'
  campo.style.opacity = '0'
  doc.body.appendChild(campo)
  campo.select()
  try {
    return doc.execCommand('copy')
  } catch {
    return false
  } finally {
    doc.body.removeChild(campo)
  }
}

/** Copia para a área de transferência (funciona sem internet). Falso se não foi possível. */
export async function copiarTexto(
  texto: string,
  nav: Pick<Navigator, 'clipboard'> = navigator,
  doc: Document = document,
): Promise<boolean> {
  try {
    if (nav.clipboard?.writeText) {
      await nav.clipboard.writeText(texto)
      return true
    }
  } catch {
    // Cai na cópia pela textarea.
  }
  return copiarPelaTextarea(texto, doc)
}

export type ResultadoDeCompartilhar =
  /** O menu nativo do celular foi usado. */
  | 'menu'
  /** Abriu o link do WhatsApp com o texto. */
  | 'whatsapp'
  /** A pessoa fechou o menu sem compartilhar. */
  | 'cancelado'
  | 'falhou'

/** Menu nativo (Web Share API) quando existir; senão, o link do WhatsApp com o texto. */
export async function compartilharTexto(
  texto: string,
  nav: Pick<Navigator, 'share'> = navigator,
  abrir: (url: string) => Window | null = (url) => {
    // Com "noopener" o navegador devolve sempre null: solta o vínculo depois de abrir.
    const janela = window.open(url, '_blank')
    if (janela) janela.opener = null
    return janela
  },
): Promise<ResultadoDeCompartilhar> {
  if (typeof nav.share === 'function') {
    try {
      await nav.share({ text: texto })
      return 'menu'
    } catch (erro) {
      if (erro instanceof DOMException && erro.name === 'AbortError') return 'cancelado'
      // Qualquer outra recusa do menu: tenta o link do WhatsApp.
    }
  }
  return abrir(linkDoWhatsApp(texto)) ? 'whatsapp' : 'falhou'
}
