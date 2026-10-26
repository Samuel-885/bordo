// Interruptor "Usar trânsito (TomTom)" em Mais: o botão de emergência. Desligado, nada chama a
// função de trânsito e a previsão pela localização usa só o OSRM, como na versão anterior.

import { useUsarTransito } from '../usarTransito'

export function UsarTransito() {
  const [ligado, definir] = useUsarTransito()
  return (
    <div className="atualizar-sozinho" data-teste="usar-transito">
      <label className="opcao">
        <input type="checkbox" role="switch" checked={ligado} onChange={(e) => definir(e.target.checked)} />
        <span>Usar trânsito (TomTom)</span>
      </label>
      <p className="dica">
        {ligado
          ? 'A previsão pela localização considera o trânsito. Só as coordenadas vão ao TomTom, por uma função do próprio site; se ele falhar, vale o OSRM.'
          : 'Desligado: a previsão pela localização usa só o OSRM, sem trânsito, e nada é enviado ao TomTom.'}
      </p>
    </div>
  )
}
