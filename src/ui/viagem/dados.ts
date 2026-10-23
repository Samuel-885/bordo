// Dados que a viagem em andamento carrega de uma vez e os tipos que as abas compartilham.

import type { Repositorio } from '../../data/repositorio'
import type { IdModelo } from '../../core/modelos'
import type { Evento, Instante, Passageiro } from '../../core/tipos'

export type PlanoCarregado = NonNullable<Awaited<ReturnType<Repositorio['carregarPlano']>>>

/** Marcas do backup (fase 10a); vazio na demonstração. */
export type MarcasDoBackup = Awaited<ReturnType<typeof carregarMarcasDoBackup>>

export async function carregarMarcasDoBackup(repo: Repositorio) {
  const [ultimo, total, silencio, restauradoDe] = await Promise.all([
    repo.obterUltimoBackup(),
    repo.contarEventos(),
    repo.obterSilencioDoBackup(),
    repo.obterRestauradoDe(),
  ])
  return { ultimo, total, silencio, restauradoDe }
}

export async function carregarDadosDaViagem(repo: Repositorio, viagemId: string) {
  const [plano, eventos, passageiros, modelos, backup] = await Promise.all([
    repo.carregarPlano(viagemId),
    repo.listarEventos(viagemId),
    repo.listarPassageiros(viagemId),
    repo.obterModelos(),
    // Backup só existe no espaço real; a demonstração não tem.
    repo.espaco === 'real' ? carregarMarcasDoBackup(repo) : Promise.resolve(null),
  ])
  return { plano, eventos, passageiros, modelos, backup }
}

/** Tudo o que as abas e as folhas precisam para desenhar e registrar. */
export interface ContextoDaViagem {
  repo: Repositorio
  plano: PlanoCarregado
  eventos: Evento[]
  passageiros: Passageiro[]
  modelos: Record<IdModelo, string | null>
  backup: MarcasDoBackup | null
  agora: Instante
  recarregar: () => void
}
