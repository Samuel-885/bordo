// Estado e ações de registro da viagem (CHEGAMOS, SAÍMOS, PARAMOS, conferência, quem desceu,
// mensagem, observação...). Fica fora das abas para a barra de ação, que aparece em todas,
// registrar com a mesma lógica. Nenhuma regra aqui: travas e cálculo vêm do núcleo.

import { useEffect, useState } from 'react'
import {
  contextoDeDescidaNaEtapa,
  contextoDeDescidaNaoPlanejada,
  contextoDeSaida,
  contextoDeVolta,
  oferecerDescidaAoChegar,
  type ContextoDeDescida,
  type DecisaoDePendente,
  type EstadoConferencia,
} from '../../core/conferencia'
import type { ConteudoEvento } from '../../core/eventos'
import type { AlvoDaMudanca } from '../../core/inclusao'
import type { Evento } from '../../core/tipos'
import { mensagemDeErroDoBanco } from '../../data/avisoBanco'
import type { Repositorio, ResultadoRegistro } from '../../data/repositorio'
import { formatarHora } from '../logica/horarios'
import { previsaoInformada } from '../logica/mensagens'
import { useVoltarFecha } from '../useVoltarFecha'
import type { ContextoDaViagem } from './dados'
import type { Derivados } from './derivados'

const JANELA_DESFAZER_MS = 8000

export type Acao = 'cancelar_inclusao' | 'parada' | 'ajuste_parada' | 'imprevisto' | 'recalibracao' | 'volta' | 'pular' | 'oferta' | 'observacao' | null

export function useRegistros(c: ContextoDaViagem, d: Derivados, aoRegistrar?: () => void) {
  const { repo, plano, eventos, passageiros, agora, recarregar } = c
  const { viagem, etapas } = plano

  const [acao, setAcao] = useState<Acao>(null)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [desfazer, setDesfazer] = useState<{ ids: string[]; texto: string } | null>(null)
  const [horaPendente, setHoraPendente] = useState('')
  /** A conferência aberta: na saída de uma etapa ou na volta à estrada (a próxima etapa). */
  const [conferindo, setConferindo] = useState<{ momento: 'saida' | 'volta'; etapaId: string } | null>(null)
  useVoltarFecha(conferindo !== null, () => setConferindo(null))
  /** A folha "Quem desceu?": aberta sozinha (CHEGAMOS, PARAMOS) ou pelo botão do cartão. */
  const [descida, setDescida] = useState<{ local: 'etapa' | 'nao_planejada'; etapaId: string; automatica: boolean } | null>(null)
  /** A prévia da mensagem de atualização e a folha de identificação e equipe. */
  const [previa, setPrevia] = useState(false)
  const [dadosAbertos, setDadosAbertos] = useState(false)
  /** Mudança de roteiro (parada incluída ou local novo) aberta por cima da viagem. */
  const [mudanca, setMudanca] = useState<AlvoDaMudanca | null>(null)
  /** Parada incluída que a pessoa quer cancelar (pede confirmação). */
  const [cancelando, setCancelando] = useState<{ eventoId: string; nome: string } | null>(null)

  useEffect(() => {
    if (!desfazer) return
    const t = setTimeout(() => setDesfazer(null), JANELA_DESFAZER_MS)
    return () => clearTimeout(t)
  }, [desfazer])

  const abrir = (a: Acao) => {
    setErro(null)
    setAcao(a)
  }
  const fechar = () => {
    setErro(null)
    setAcao(null)
  }

  /** Executa um registro; em sucesso, mostra o aviso com DESFAZER e recarrega. */
  async function registrar(fazer: () => Promise<ResultadoRegistro>, texto: string): Promise<boolean> {
    setOcupado(true)
    setErro(null)
    try {
      const r = await fazer()
      if (!r.ok) {
        setErro(r.motivo)
        return false
      }
      aoRegistrar?.()
      setDesfazer({ ids: r.eventos.map((e) => e.id), texto })
      recarregar()
      return true
    } catch (x) {
      setErro(mensagemDeErroDoBanco(x, 'Não foi possível registrar.'))
      return false
    } finally {
      setOcupado(false)
    }
  }

  const registrarConteudo = (conteudo: ConteudoEvento, texto: string, opcoes?: Parameters<Repositorio['registrarEvento']>[2]) =>
    registrar(() => repo.registrarEvento(viagem.id, conteudo, opcoes), texto)

  /** Um registro feito fora daqui (a tela de mudança de roteiro): mostra o DESFAZER e recarrega. */
  function registroFeito(eventosCriados: Evento[], texto: string) {
    aoRegistrar?.()
    setMudanca(null)
    setDesfazer({ ids: eventosCriados.map((e) => e.id), texto })
    recarregar()
  }

  async function cancelarInclusao() {
    if (!cancelando) return
    const { eventoId, nome } = cancelando
    const ok = await registrar(() => repo.cancelarInclusao(viagem.id, eventoId), `Parada incluída cancelada: ${nome}.`)
    if (ok) setCancelando(null)
  }

  async function desfazerUltimo() {
    if (!desfazer) return
    const { ids } = desfazer
    setDesfazer(null)
    const r = await repo.desfazerRegistro(viagem.id, ids)
    if (!r.ok) setErro(r.motivo)
    recarregar()
  }

  // ---------- Botões ----------

  /** Todo SAÍMOS passa pela conferência. Sem passageiros cadastrados, grava a saída direto. */
  const aoSair = async (etapaId: string) => {
    if (passageiros.length === 0) {
      await registrarConteudo({ tipo: 'saida', etapaId }, `Saída registrada às ${formatarHora(agora)}.`)
      return
    }
    setErro(null)
    setConferindo({ momento: 'saida', etapaId })
  }
  /** VOLTAMOS depois de uma parada não planejada também passa pela conferência (modo "só alguns"). */
  const aoVoltar = async (etapaId: string) => {
    if (passageiros.length === 0) {
      await registrarConteudo(
        { tipo: 'parada_nao_planejada', etapaId, dados: { fase: 'fim' } },
        `VOLTAMOS registrado às ${formatarHora(agora)}.`,
      )
      return
    }
    setErro(null)
    setConferindo({ momento: 'volta', etapaId })
  }
  async function confirmarConferencia(estado: EstadoConferencia, decisoes: DecisaoDePendente[]) {
    if (!conferindo) return
    const contexto =
      conferindo.momento === 'saida'
        ? contextoDeSaida(conferindo.etapaId, plano, passageiros, eventos)
        : contextoDeVolta(conferindo.etapaId, plano, passageiros, eventos)
    const ok =
      conferindo.momento === 'saida'
        ? await registrar(
            () => repo.registrarSaidaComConferencia(viagem.id, conferindo.etapaId, { contexto, estado, decisoes }),
            `Saída registrada às ${formatarHora(agora)}.`,
          )
        : await registrar(
            () => repo.registrarVoltaComConferencia(viagem.id, { contexto, estado, decisoes }),
            `VOLTAMOS registrado às ${formatarHora(agora)}.`,
          )
    if (ok) setConferindo(null)
  }
  const aoChegar = async (etapaId: string) => {
    const ok = await registrar(() => repo.registrarChegada(viagem.id, etapaId), `Chegada registrada às ${formatarHora(agora)}.`)
    if (ok) oferecerDescida('etapa', etapaId)
  }

  /** Abre "Quem desceu?" sozinha, se há alguém a bordo naquele ponto e a etapa não é refeição nem destino. */
  function oferecerDescida(local: 'etapa' | 'nao_planejada', etapaId: string) {
    if (passageiros.length === 0) return
    const etapaDaParada = d.etapaDe(etapaId)
    if (local === 'etapa' && (!etapaDaParada || !oferecerDescidaAoChegar(etapaDaParada))) return
    if (contextoDeDescida(local, etapaId).aBordo.length === 0) return
    setErro(null)
    setDescida({ local, etapaId, automatica: true })
  }

  function contextoDeDescida(local: 'etapa' | 'nao_planejada', etapaId: string): ContextoDeDescida {
    return local === 'etapa'
      ? contextoDeDescidaNaEtapa(etapaId, plano, passageiros, eventos)
      : contextoDeDescidaNaoPlanejada(etapaId, plano, passageiros, eventos)
  }

  async function salvarDescida(passageiroIds: string[]) {
    if (!descida) return
    const { local, etapaId } = descida
    const ok = await registrarConteudo(
      { tipo: 'desceram', etapaId, dados: { local, passageiroIds } },
      passageiroIds.length === 1 ? '1 passageiro marcado como desceu.' : `${passageiroIds.length} passageiros marcados como desceram.`,
    )
    if (ok) setDescida(null)
  }

  /** Grava na timeline que uma atualização foi gerada (só o horário e a previsão informada, nunca o texto). */
  async function registrarAtualizacaoGerada() {
    try {
      const r = await repo.registrarEvento(viagem.id, { tipo: 'atualizacao_gerada', dados: previsaoInformada(plano, eventos, agora) })
      if (!r.ok) setErro(r.motivo)
      recarregar()
    } catch (x) {
      setErro(mensagemDeErroDoBanco(x, 'Não foi possível registrar a atualização na timeline.'))
    }
  }

  async function salvarDados(dados: { identificacao: string; equipe: number }) {
    setOcupado(true)
    setErro(null)
    try {
      await repo.salvarViagem({ ...viagem, identificacao: dados.identificacao, equipe: dados.equipe })
      setDadosAbertos(false)
      recarregar()
    } catch (x) {
      setErro(mensagemDeErroDoBanco(x, 'Não foi possível salvar.'))
    } finally {
      setOcupado(false)
    }
  }

  return {
    etapas,
    acao, setAcao, abrir, fechar,
    ocupado, erro, setErro,
    desfazer, desfazerUltimo,
    horaPendente, setHoraPendente,
    conferindo, setConferindo, confirmarConferencia,
    descida, setDescida, salvarDescida, contextoDeDescida,
    previa, setPrevia,
    dadosAbertos, setDadosAbertos,
    mudanca, setMudanca, registroFeito,
    cancelando, setCancelando, cancelarInclusao,
    registrar, registrarConteudo, registrarAtualizacaoGerada, salvarDados,
    aoSair, aoVoltar, aoChegar, oferecerDescida,
  }
}

export type Registros = ReturnType<typeof useRegistros>
