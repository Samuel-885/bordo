import type { ReactNode } from 'react'

export type Aba = 'viagem' | 'roteiro' | 'pessoas' | 'locais' | 'mais'

const ABAS: { aba: Aba; rotulo: string; icone: ReactNode }[] = [
  {
    aba: 'viagem',
    rotulo: 'Viagem',
    icone: (
      <>
        <rect x="4" y="3" width="16" height="14" rx="3" />
        <path d="M4 11h16M8 21v-4M16 21v-4" />
        <circle cx="8" cy="14" r=".6" />
        <circle cx="16" cy="14" r=".6" />
      </>
    ),
  },
  {
    aba: 'roteiro',
    rotulo: 'Roteiro',
    icone: (
      <>
        <circle cx="6" cy="6" r="2" />
        <circle cx="6" cy="18" r="2" />
        <path d="M6 8v8M11 6h9M11 18h9M11 12h9" />
      </>
    ),
  },
  {
    aba: 'pessoas',
    rotulo: 'Pessoas',
    icone: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5.2a3 3 0 0 1 0 5.6M18 14.4c2 .8 3 2.6 3 5.6" />
      </>
    ),
  },
  {
    aba: 'locais',
    rotulo: 'Locais',
    icone: (
      <>
        <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" />
        <circle cx="12" cy="9.5" r="2.5" />
      </>
    ),
  },
  {
    aba: 'mais',
    rotulo: 'Mais',
    icone: (
      <>
        <circle cx="5" cy="12" r="1.3" />
        <circle cx="12" cy="12" r="1.3" />
        <circle cx="19" cy="12" r="1.3" />
      </>
    ),
  },
]

interface Props {
  atual: Aba
  onMudar: (aba: Aba) => void
}

/** Cinco abas com ícone e texto, sempre no pé da tela. */
export function BarraDeAbas({ atual, onMudar }: Props) {
  return (
    <nav className="barra-abas" aria-label="Abas do app">
      {ABAS.map(({ aba, rotulo, icone }) => (
        <button
          key={aba}
          type="button"
          className={`aba${aba === atual ? ' atual' : ''}`}
          aria-current={aba === atual ? 'page' : undefined}
          data-aba={aba}
          onClick={() => onMudar(aba)}
        >
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {icone}
          </svg>
          <span>{rotulo}</span>
        </button>
      ))}
    </nav>
  )
}
