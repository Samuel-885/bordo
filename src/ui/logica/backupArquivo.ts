// Entrega do arquivo de backup: menu de compartilhar (WhatsApp, Drive, e-mail) ou download.
// O arquivo sai como texto puro (.txt): o Chrome do Android só compartilha alguns tipos de
// arquivo (imagem, áudio, vídeo, PDF e texto) e recusa .json / application/json. O conteúdo
// continua sendo o JSON do backup. Recebem o navegador como argumento, para teste.

export const TIPO_DO_ARQUIVO = 'text/plain'

export function criarArquivoDeBackup(conteudo: string, nome: string): File {
  return new File([conteudo], nome, { type: TIPO_DO_ARQUIVO })
}

type NavegadorParaArquivo = Pick<Navigator, 'share' | 'canShare'>

/** Só `true` quando o navegador aceita compartilhar este arquivo (o que o Chrome decide pelo tipo e pela extensão). */
export function podeCompartilharArquivo(arquivo: File, nav: Partial<NavegadorParaArquivo> = navigator): boolean {
  try {
    return typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [arquivo] })
  } catch {
    return false
  }
}

export type ResultadoDaEntrega =
  /** O menu do celular aceitou o arquivo. O app não sabe se o envio terminou. */
  | 'compartilhado'
  /** A pessoa fechou o menu sem compartilhar. */
  | 'cancelado'
  | 'falhou'

export async function compartilharArquivo(arquivo: File, nav: Partial<NavegadorParaArquivo> = navigator): Promise<ResultadoDaEntrega> {
  if (!podeCompartilharArquivo(arquivo, nav)) return 'falhou'
  try {
    await nav.share?.({ files: [arquivo], title: 'Backup do Bordo' })
    return 'compartilhado'
  } catch (erro) {
    return erro instanceof DOMException && erro.name === 'AbortError' ? 'cancelado' : 'falhou'
  }
}

/** Download pelo navegador (funciona sem internet). */
export function baixarArquivo(
  arquivo: File,
  doc: Pick<Document, 'createElement' | 'body'> = document,
  urls: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'> = URL,
): void {
  const url = urls.createObjectURL(arquivo)
  const link = doc.createElement('a')
  link.href = url
  link.download = arquivo.name
  link.style.display = 'none'
  doc.body.appendChild(link)
  link.click()
  doc.body.removeChild(link)
  // O download já começou; soltar o endereço logo depois evita guardar o arquivo na memória.
  setTimeout(() => urls.revokeObjectURL(url), 10_000)
}

/** O texto do arquivo escolhido na restauração (.txt ou .json). */
export function lerArquivoEscolhido(arquivo: Pick<File, 'text'>): Promise<string> {
  return arquivo.text()
}
