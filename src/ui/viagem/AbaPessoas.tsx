// Aba "Pessoas": o cadastro de passageiros (tela de sempre), com o resumo de a bordo no topo.

import { textoABordo, tituloDoABordo } from '../logica/textosViagem'
import { Passageiros } from '../Passageiros'
import type { ContextoDaViagem } from './dados'
import type { Derivados } from './derivados'

export function AbaPessoas({ c, d }: { c: ContextoDaViagem; d: Derivados }) {
  return (
    <main className="conteudo viagem">
      <section className="cartao" aria-label="A bordo">
        <h2>{tituloDoABordo(d.aBordo)}</h2>
        <p className="linha-grande">{d.aBordo ? textoABordo(d.aBordo) : c.passageiros.length === 0 ? 'Sem passageiros cadastrados' : '—'}</p>
      </section>
      <Passageiros repo={c.repo} viagemId={c.plano.viagem.id} incorporada />
    </main>
  )
}
