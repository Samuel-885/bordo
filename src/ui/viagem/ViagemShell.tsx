// Casca da viagem em andamento: carrega os dados uma vez, calcula os derivados, guarda o
// estado dos registros e desenha a aba atual com as folhas por cima. A conferência ocupa a
// tela inteira enquanto está aberta.

import { descidaParaConferencia, contextoDeSaida, contextoDeVolta } from '../../core/conferencia'
import type { Repositorio } from '../../data/repositorio'
import { Conferencia } from '../Conferencia'
import { BarraDeAbas, type Aba } from '../componentes/BarraDeAbas'
import { BarraDeAcao } from '../componentes/BarraDeAcao'
import { Cabecalho } from '../componentes/Cabecalho'
import { Topo } from '../componentes/Topo'
import { useAgora, useAoMudar } from '../useAgora'
import { useDados } from '../useDados'
import { acoesDoRodape } from './acoes'
import { Locais } from '../Locais'
import { AbaMais } from './AbaMais'
import { AbaPessoas } from './AbaPessoas'
import { AbaRoteiro, type VisaoDoRoteiro } from './AbaRoteiro'
import { AbaViagem } from './AbaViagem'
import { carregarDadosDaViagem, type ContextoDaViagem } from './dados'
import { derivarViagem } from './derivados'
import { FolhasDaViagem } from './FolhasDaViagem'
import { useAlturaDoRodape } from './useAlturaDoRodape'
import { useRegistros } from './useRegistros'

interface Props {
  repo: Repositorio
  viagemId: string
  onVoltar: () => void
  aba: Aba
  visao?: VisaoDoRoteiro
  onAba: (aba: Aba, visao?: VisaoDoRoteiro) => void
  onAlternativas: () => void
  onModelos: () => void
  onBackup: () => void
  onEditarLocal: (localId: string | null) => void
  onAbrirDemo: () => void
  onSairDaDemo: () => void
  /** A demonstração usa para sair do cenário e entrar no modo livre. */
  aoRegistrar?: () => void
}

export function ViagemShell({ repo, viagemId, onVoltar, ...resto }: Props) {
  const { dados, erro, recarregar } = useDados(() => carregarDadosDaViagem(repo, viagemId), `${repo.espaco}:${viagemId}`)
  useAoMudar(recarregar)
  const agora = useAgora()

  if (erro) {
    return (
      <>
        <Topo titulo="Viagem" onVoltar={onVoltar} rotuloVoltar="Voltar às viagens" />
        <main className="conteudo"><p className="msg-erro">{erro}</p></main>
      </>
    )
  }
  if (!dados) return <Topo titulo="Viagem" onVoltar={onVoltar} rotuloVoltar="Voltar às viagens" />
  if (!dados.plano || !dados.plano.viagem.planoOriginal) {
    return (
      <>
        <Topo titulo="Viagem" onVoltar={onVoltar} rotuloVoltar="Voltar às viagens" />
        <main className="conteudo"><p className="msg-erro">Viagem não encontrada ou ainda não iniciada.</p></main>
      </>
    )
  }
  const c: ContextoDaViagem = { repo, plano: dados.plano, eventos: dados.eventos, passageiros: dados.passageiros, modelos: dados.modelos, backup: dados.backup, agora, recarregar }
  return <ViagemAberta c={c} onVoltar={onVoltar} {...resto} />
}

function ViagemAberta({ c, aba, visao, onAba, onAlternativas, onModelos, onBackup, onEditarLocal, onAbrirDemo, onSairDaDemo, onVoltar, aoRegistrar }: { c: ContextoDaViagem } & Omit<Props, 'repo' | 'viagemId'>) {
  const d = derivarViagem(c)
  const r = useRegistros(c, d, aoRegistrar)
  const rodape = useAlturaDoRodape()

  if (r.conferindo) {
    const { conferindo } = r
    const contexto =
      conferindo.momento === 'saida'
        ? contextoDeSaida(conferindo.etapaId, c.plano, c.passageiros, c.eventos)
        : contextoDeVolta(conferindo.etapaId, c.plano, c.passageiros, c.eventos)
    return (
      <Conferencia
        key={`${conferindo.momento}-${conferindo.etapaId}`}
        contexto={contexto}
        etapa={d.etapaDe(conferindo.etapaId) ?? { tipo: 'obrigatoria' }}
        etapas={c.plano.etapas}
        titulo={conferindo.momento === 'saida' ? `Saída de ${d.nome(conferindo.etapaId)}` : 'Volta à estrada'}
        rotuloSair={conferindo.momento === 'saida' ? 'SAÍMOS' : 'VOLTAMOS'}
        desceram={descidaParaConferencia(contexto, c.eventos)}
        ocupado={r.ocupado}
        erro={r.erro}
        onConfirmar={(estado, decisoes) => void r.confirmarConferencia(estado, decisoes)}
        onFechar={() => r.setConferindo(null)}
      />
    )
  }

  const { viagem } = c.plano
  const acoes = acoesDoRodape(c, d, r)
  const folhaAberta = r.acao !== null || r.descida !== null || r.previa || r.dadosAbertos
  return (
    <>
      <Cabecalho subtitulo={`${viagem.nome || 'Viagem'} · ${viagem.tipo === 'ida' ? 'Ida' : 'Volta'}`} />
      {aba === 'viagem' ? (
        <AbaViagem c={c} d={d} r={r} onAba={onAba} onBackup={onBackup} />
      ) : aba === 'roteiro' ? (
        <AbaRoteiro c={c} d={d} visaoInicial={visao} onAlternativas={onAlternativas} />
      ) : aba === 'pessoas' ? (
        <AbaPessoas c={c} d={d} />
      ) : aba === 'locais' ? (
        <main className="conteudo viagem">
          <Locais repo={c.repo} onEditar={onEditarLocal} incorporada />
        </main>
      ) : (
        <AbaMais c={c} d={d} r={r} onModelos={onModelos} onBackup={onBackup} onTrocarViagem={onVoltar} onAbrirDemo={onAbrirDemo} onSairDaDemo={onSairDaDemo} />
      )}
      <div className="rodape-fixo" ref={rodape}>
        {aba === 'viagem' && !d.concluida && (
          <BarraDeAcao principal={acoes.principal} rapidas={acoes.rapidas} ocupado={r.ocupado} erro={folhaAberta ? null : r.erro} />
        )}
        <BarraDeAbas atual={aba} onMudar={onAba} />
      </div>
      <FolhasDaViagem c={c} d={d} r={r} onModelos={onModelos} />
    </>
  )
}
