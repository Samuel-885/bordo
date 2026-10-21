// Avisos sobre o banco quando o app está aberto em mais de um lugar (outra aba, janela ou
// o app instalado). O banco avisa por aqui e a tela mostra a mensagem.

export type AvisoDoBanco = 'atualizado' | 'bloqueado'

export const TEXTO_ATUALIZADO = 'O Bordo foi atualizado. Toque para recarregar.'
export const TEXTO_BLOQUEADO = 'Feche as outras abas ou janelas do Bordo e toque para tentar de novo.'

type Ouvinte = (aviso: AvisoDoBanco | null) => void

const ouvintes = new Set<Ouvinte>()
let atual: AvisoDoBanco | null = null

export function avisarBanco(aviso: AvisoDoBanco | null): void {
  atual = aviso
  ouvintes.forEach((o) => o(aviso))
}

/** Quem se inscreve recebe logo o aviso que já estiver valendo. */
export function assinarAvisosDoBanco(ouvinte: Ouvinte): () => void {
  ouvintes.add(ouvinte)
  ouvinte(atual)
  return () => {
    ouvintes.delete(ouvinte)
  }
}

/** Troca o erro técnico de um banco fechado pela mensagem para a pessoa. */
export function mensagemDeErroDoBanco(erro: unknown, padrao: string): string {
  if (erro instanceof Error && erro.name === 'DatabaseClosedError') return TEXTO_ATUALIZADO
  return erro instanceof Error ? erro.message : padrao
}
