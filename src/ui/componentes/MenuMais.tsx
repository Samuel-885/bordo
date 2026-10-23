// Peças da aba "Mais" (na viagem e no planejamento): linhas de menu e o grupo
// "Dados e aparelho" (backup, modo noite, trocar de viagem, demonstração).

import type { ReactNode } from 'react'
import { PREFERENCIAS, ROTULO_PREFERENCIA } from '../logica/tema'
import { useTema } from '../tema'

interface ItemProps {
  titulo: string
  detalhe?: string
  onClick?: () => void
  desligado?: boolean
  perigo?: boolean
}

export function ItemDeMenu({ titulo, detalhe, onClick, desligado, perigo }: ItemProps) {
  return (
    <li>
      <button type="button" className={`item-menu${perigo ? ' perigo' : ''}`} onClick={onClick} disabled={desligado}>
        <span className="item-texto">
          <strong>{titulo}</strong>
          {detalhe && <span className="item-detalhe">{detalhe}</span>}
        </span>
        {!desligado && <span className="item-seta" aria-hidden="true">›</span>}
      </button>
    </li>
  )
}

export function GrupoDeMenu({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="grupo-menu" aria-label={titulo}>
      <h2>{titulo}</h2>
      <ul>{children}</ul>
    </section>
  )
}

interface DadosProps {
  demo: boolean
  /** "Último backup: hoje 08:12", quando a tela sabe. */
  detalheDoBackup?: string
  onBackup: () => void
  onTrocarViagem: () => void
  onAbrirDemo: () => void
  onSairDaDemo: () => void
  /** Linhas a mais no fim do grupo (por exemplo, excluir viagem no planejamento). */
  extra?: ReactNode
}

export function GrupoDadosEAparelho({ demo, detalheDoBackup, onBackup, onTrocarViagem, onAbrirDemo, onSairDaDemo, extra }: DadosProps) {
  const { preferencia, definir } = useTema()
  return (
    <GrupoDeMenu titulo="Dados e aparelho">
      {!demo && <ItemDeMenu titulo="Backup" detalhe={detalheDoBackup} onClick={onBackup} />}
      <li className="item-tema">
        <div className="item-texto">
          <strong id="rotulo-tema">Modo noite</strong>
          <span className="item-detalhe">automático das 18:00 às 06:00</span>
        </div>
        <div className="segmentos tres" role="radiogroup" aria-labelledby="rotulo-tema">
          {PREFERENCIAS.map((p) => (
            <button key={p} type="button" role="radio" aria-checked={preferencia === p} className="segmento" onClick={() => definir(p)}>
              {ROTULO_PREFERENCIA[p]}
            </button>
          ))}
        </div>
      </li>
      <ItemDeMenu titulo="Trocar de viagem" detalhe="voltar à lista de viagens" onClick={onTrocarViagem} />
      {demo ? (
        <ItemDeMenu titulo="Sair da demonstração" detalhe="volta às viagens de verdade" onClick={onSairDaDemo} />
      ) : (
        <ItemDeMenu titulo="Demonstração" detalhe="relógio simulado e dados fictícios" onClick={onAbrirDemo} />
      )}
      {extra}
    </GrupoDeMenu>
  )
}
