// Pede ao navegador que não apague os dados do app quando faltar espaço.
// O backup (fase 10) continua sendo a garantia.

export type ResultadoPersistencia = 'concedido' | 'negado' | 'indisponivel'

export async function pedirArmazenamentoPersistente(
  armazenamento: Pick<StorageManager, 'persist' | 'persisted'> | undefined = globalThis.navigator?.storage,
): Promise<ResultadoPersistencia> {
  if (!armazenamento || typeof armazenamento.persist !== 'function') return 'indisponivel'
  try {
    if (typeof armazenamento.persisted === 'function' && (await armazenamento.persisted())) return 'concedido'
    return (await armazenamento.persist()) ? 'concedido' : 'negado'
  } catch {
    return 'negado'
  }
}
