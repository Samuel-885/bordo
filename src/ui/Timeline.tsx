// Timeline: os eventos registrados em ordem, com o atraso de cada chegada e saída.
// Chegadas e saídas podem ser corrigidas, com as travas do núcleo.

import { useState } from 'react'
import { limitesDoHorario } from '../core/registro'
import type { Repositorio } from '../data/repositorio'
import { Hora } from './componentes/Hora'
import { Topo } from './componentes/Topo'
import { FolhaHorario, FolhaObservacao } from './Folhas'
import { formatarHora } from './logica/horarios'
import { montarTimeline, textoDoAtraso } from './logica/textosViagem'
import { useAgora, useAoMudar } from './useAgora'
import { useDados } from './useDados'
import { classificarAtraso } from '../core/atraso'
import type { Instante } from '../core/tipos'
import { mensagemDeErroDoBanco } from '../data/avisoBanco'

interface Props {
  repo: Repositorio
  viagemId: string
  onVoltar: () => void
}

export function Timeline({ repo, viagemId, onVoltar }: Props) {
  const { dados, erro, recarregar } = useDados(async () => {
    const [plano, eventos, passageiros] = await Promise.all([
      repo.carregarPlano(viagemId),
      repo.listarEventos(viagemId),
      repo.listarPassageiros(viagemId),
    ])
    return { plano, eventos, passageiros }
  }, `timeline:${repo.espaco}:${viagemId}`)
  useAoMudar(recarregar)
  const agora = useAgora()
  const [corrigindo, setCorrigindo] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)

  const original = dados?.plano?.viagem.planoOriginal
  if (erro || (dados && (!dados.plano || !original))) {
    return (
      <>
        <Topo titulo="Timeline" onVoltar={onVoltar} />
        <main className="conteudo"><p className="msg-erro">{erro ?? 'Viagem não encontrada ou ainda não iniciada.'}</p></main>
      </>
    )
  }
  if (!dados?.plano || !original) return <Topo titulo="Timeline" onVoltar={onVoltar} />

  const { plano, eventos, passageiros } = dados
  const itens = montarTimeline(plano, original, eventos, agora, passageiros)
  const alvo = corrigindo ? eventos.find((e) => e.id === corrigindo) : undefined
  const itemAlvo = itens.find((i) => i.id === corrigindo)

  async function corrigir(horario: Instante) {
    if (!corrigindo) return
    setOcupado(true)
    setFalha(null)
    try {
      const r = await repo.corrigirHorarioDoEvento(viagemId, corrigindo, horario)
      if (!r.ok) {
        setFalha(r.motivo)
        return
      }
      setCorrigindo(null)
      recarregar()
    } catch (x) {
      setFalha(mensagemDeErroDoBanco(x, 'Não foi possível corrigir.'))
    } finally {
      setOcupado(false)
    }
  }

  async function corrigirObservacao(horario: Instante, texto: string) {
    if (!corrigindo) return
    setOcupado(true)
    setFalha(null)
    try {
      const r = await repo.corrigirObservacao(viagemId, corrigindo, texto, horario)
      if (!r.ok) {
        setFalha(r.motivo)
        return
      }
      setCorrigindo(null)
      recarregar()
    } catch (x) {
      setFalha(mensagemDeErroDoBanco(x, 'Não foi possível corrigir.'))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <>
      <Topo titulo="Timeline" onVoltar={onVoltar} />
      <main className="conteudo">
        <ol className="timeline">
          {itens.map((i) => {
            const classe = i.atraso === null ? null : classificarAtraso(i.atraso)
            const corpo = (
              <>
                <span className="t-hora"><Hora instante={i.horario} agora={agora} /></span>
                <span className="t-corpo">
                  <span className={i.riscado ? 'riscado' : undefined}>{i.titulo}</span>
                  {i.detalhe && <small>{i.detalhe}</small>}
                </span>
                {classe && <span className={`t-atraso ${classe.situacao}`}>{textoDoAtraso(classe.minutos)}</span>}
              </>
            )
            return (
              <li key={i.id}>
                {i.corrigivel ? (
                  <button type="button" className="t-item" onClick={() => { setFalha(null); setCorrigindo(i.id) }}>
                    {corpo}
                  </button>
                ) : (
                  <div className="t-item">{corpo}</div>
                )}
              </li>
            )
          })}
        </ol>
        <p className="dica">Toque em uma chegada, saída ou observação para corrigir.</p>
      </main>

      {alvo?.tipo === 'observacao' && (
        <FolhaObservacao
          key={alvo.id}
          aberta
          ocupado={ocupado}
          erro={falha}
          agora={agora}
          titulo="Corrigir observação"
          rotuloConfirmar="Salvar"
          textoInicial={alvo.dados.texto}
          horaInicial={formatarHora(alvo.horarioFato)}
          onCancelar={() => setCorrigindo(null)}
          onConfirmar={({ horario, texto }) => void corrigirObservacao(horario, texto)}
        />
      )}

      {alvo && alvo.tipo !== 'observacao' && itemAlvo && (
        <FolhaHorario
          key={alvo.id}
          aberta
          ocupado={ocupado}
          erro={falha}
          agora={agora}
          titulo="Corrigir horário"
          rotulo={itemAlvo.titulo}
          inicial={formatarHora(alvo.horarioFato)}
          limites={
            alvo.tipo === 'chegada' || alvo.tipo === 'saida'
              ? limitesDoHorario(plano, eventos, { tipo: alvo.tipo, etapaId: alvo.etapaId }, agora)
              : undefined
          }
          onCancelar={() => setCorrigindo(null)}
          onConfirmar={(h) => void corrigir(h)}
        />
      )}
    </>
  )
}
