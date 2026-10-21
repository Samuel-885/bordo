// Registro do service worker. A versão nova fica esperando: o app avisa e só troca
// quando a pessoa toca em "Atualizar". Nunca recarrega sozinho no meio da viagem.

import { registerSW } from 'virtual:pwa-register'

export const EVENTO_NOVA_VERSAO = 'bordo:nova-versao'

let aplicar: ((recarregar?: boolean) => Promise<void>) | null = null

export function iniciarPwa(): void {
  aplicar = registerSW({
    onNeedRefresh() {
      window.dispatchEvent(new Event(EVENTO_NOVA_VERSAO))
    },
  })
}

/** Ativa a versão nova e recarrega a página. */
export function aplicarAtualizacao(): void {
  void aplicar?.(true)
}
