// As ações do rodapé em cada situação da viagem. Só escolhe o que mostrar: os registros
// e as travas vêm do núcleo, pelo hook useRegistros.

import type { AcaoDoRodape } from '../componentes/BarraDeAcao'
import type { ContextoDaViagem } from './dados'
import type { Derivados } from './derivados'
import type { Registros } from './useRegistros'

export function acoesDoRodape(c: ContextoDaViagem, d: Derivados, r: Registros): { principal: AcaoDoRodape | null; rapidas: AcaoDoRodape[] } {
  const { s, proxima, concluida, pendencia, podeRecalibrar } = d
  if (concluida) return { principal: null, rapidas: [] }

  const mensagem: AcaoDoRodape = { rotulo: 'Mensagem', onClick: () => { r.setErro(null); r.setPrevia(true) } }
  const observacao: AcaoDoRodape = { rotulo: 'Observação', onClick: () => r.abrir('observacao') }
  const quemDesceu = (local: 'etapa' | 'nao_planejada', etapaId: string | null): AcaoDoRodape => {
    const ha = etapaId !== null && c.passageiros.length > 0 && r.contextoDeDescida(local, etapaId).aBordo.length > 0
    return {
      rotulo: 'Quem desceu',
      desabilitada: !ha,
      dica: ha ? undefined : 'Ninguém a bordo neste ponto',
      onClick: () => etapaId && (r.setErro(null), r.setDescida({ local, etapaId, automatica: false })),
    }
  }

  // Registro esquecido: o cartão da aba Viagem pede o horário antes de qualquer botão.
  if (pendencia) return { principal: null, rapidas: [observacao, mensagem] }

  if (s.situacao === 'em_viagem') {
    return {
      principal: { rotulo: 'CHEGAMOS', onClick: () => proxima && void r.aoChegar(proxima) },
      rapidas: [
        { rotulo: 'PARAMOS', onClick: () => r.abrir('parada') },
        { rotulo: 'Previsão', desabilitada: !podeRecalibrar, dica: podeRecalibrar ? undefined : 'Sem previsão a atualizar agora', onClick: () => r.abrir('recalibracao') },
        mensagem,
      ],
    }
  }
  if (s.situacao === 'parada_nao_planejada') {
    return {
      principal: { rotulo: 'VOLTAMOS', onClick: () => s.paradaNaoPlanejada && void r.aoVoltar(s.paradaNaoPlanejada.etapaId) },
      rapidas: [quemDesceu('nao_planejada', s.paradaNaoPlanejada?.etapaId ?? null), observacao, mensagem],
    }
  }
  // Aguardando a saída ou parado numa etapa.
  return {
    principal: { rotulo: 'SAÍMOS', onClick: () => s.etapaAtualId && void r.aoSair(s.etapaAtualId) },
    rapidas: [quemDesceu('etapa', s.situacao === 'em_parada' ? s.etapaAtualId : null), observacao, mensagem],
  }
}
