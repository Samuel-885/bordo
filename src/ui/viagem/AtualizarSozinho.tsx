// Interruptor "Atualizar sozinho a cada 5 minutos" (cartão "Próxima parada" e aba Mais). Ligar é a
// autorização: o que o modo faz está dito no texto. O estado vem do hook; nenhuma regra aqui.

import { CONFIG } from '../../core/config'
import { linhasDoAutomatico } from '../logica/atualizarSozinho'
import type { AtualizacaoAutomatica } from './useAtualizacaoAutomatica'

export function AtualizarSozinho({ auto }: { auto: AtualizacaoAutomatica }) {
  const { ligado, definir, estado, texto } = auto
  const linhas = ligado
    ? linhasDoAutomatico({ pausa: texto, lendo: estado.lendo, ultimaEm: estado.ultimaEm, falha: estado.falha, tentaEm: estado.tentaEm })
    : []
  return (
    <div className="atualizar-sozinho" data-teste="atualizar-sozinho">
      <label className="opcao">
        <input type="checkbox" role="switch" checked={ligado} onChange={(e) => definir(e.target.checked)} />
        <span>Atualizar sozinho a cada {CONFIG.atualizacaoAutomaticaMin} minutos</span>
      </label>
      <p className="dica">
        Só funciona com o app aberto na tela, que fica acesa. A cada atualização, só as coordenadas vão ao serviço de rotas
        (OpenStreetMap); a posição não é guardada. Para voltar atrás, desligue ou informe outro horário.
      </p>
      {linhas.map((l) => (
        <p key={l} className="dica" role="status" data-teste="atualizar-sozinho-estado">{l}</p>
      ))}
    </div>
  )
}
