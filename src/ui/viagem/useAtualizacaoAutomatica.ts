// Atualizar sozinho pela localização: a cada `atualizacaoAutomaticaMin` minutos (medidos pelo
// agora()), lê o GPS, calcula a rota até a próxima parada e grava uma recalibração marcada
// `automatica`, sem confirmação e sem DESFAZER. Só com o app aberto na tela. Nenhuma regra aqui:
// quando atualiza, pausa ou grava vem de `core/atualizacaoAutomatica.ts`.

import { useEffect, useRef, useState } from 'react'
import {
  decidirGravacao,
  proximoCiclo,
  situacaoDoAutomatico,
  textoDaFalhaAutomatica,
  textoDaPausa,
  type SituacaoDoAutomatico,
} from '../../core/atualizacaoAutomatica'
import { criarPrevia } from '../../core/localizacao'
import { agora as relogio } from '../../core/relogio'
import { antes, truncarMinuto } from '../../core/tempo'
import type { Instante } from '../../core/tipos'
import { rotaDaPosicaoPrecisa } from '../../servicos/localizacao'
import { mensagemDeErroDoBanco } from '../../data/avisoBanco'
import { useAtualizarSozinho } from '../atualizarSozinho'
import { lerUsarTransito } from '../usarTransito'
import { useWakeLock } from '../useWakeLock'
import type { ContextoDaViagem } from './dados'
import type { Derivados } from './derivados'

export interface EstadoDoAutomatico {
  lendo: boolean
  /** A última leitura que deu certo (gravando ou confirmando a previsão que já valia). */
  ultimaEm: Instante | null
  /** Por que o último ciclo não deu certo; vazio quando deu. */
  falha: string | null
  /** Quando tenta de novo depois de uma falha. */
  tentaEm: Instante | null
}

export interface AtualizacaoAutomatica {
  ligado: boolean
  definir: (ligado: boolean) => void
  situacao: SituacaoDoAutomatico
  estado: EstadoDoAutomatico
  /** Por que o modo está pausado (ligado, mas sem poder atualizar agora); vazio nos outros casos. */
  texto: string | null
}

const INICIAL: EstadoDoAutomatico = { lendo: false, ultimaEm: null, falha: null, tentaEm: null }

const visivelAgora = () => typeof document === 'undefined' || document.visibilityState === 'visible'

export function useAtualizacaoAutomatica(c: ContextoDaViagem, d: Derivados, aoRegistrar?: () => void): AtualizacaoAutomatica {
  const [ligado, definir] = useAtualizarSozinho(c.plano.viagem.id)
  const [estado, setEstado] = useState<EstadoDoAutomatico>(INICIAL)
  const [visivel, setVisivel] = useState(visivelAgora)
  const proximoEm = useRef<Instante | null>(null)
  const emCurso = useRef(false)

  const { plano, eventos, agora } = c
  const original = plano.viagem.planoOriginal!
  const temCoordenadas = d.localDe(d.proxima)?.coordenadas !== undefined
  const situacao = situacaoDoAutomatico(plano, original, eventos, temCoordenadas, agora)

  // O ciclo roda fora do desenho: sempre lê a versão mais recente dos dados.
  const recente = useRef({ c, d, ligado })
  recente.current = { c, d, ligado }


  // Segundo plano: para; ao voltar, atualiza na hora e retoma o ciclo.
  useEffect(() => {
    const aoMudar = () => {
      const v = visivelAgora()
      setVisivel(v)
      proximoEm.current = null
    }
    document.addEventListener('visibilitychange', aoMudar)
    return () => document.removeEventListener('visibilitychange', aoMudar)
  }, [])

  // A viagem terminou: desliga e zera a preferência.
  const encerrada = situacao.situacao === 'encerrada'
  useEffect(() => {
    if (ligado && encerrada) definir(false)
  }, [ligado, encerrada, definir])

  async function ciclo() {
    emCurso.current = true
    setEstado((e) => ({ ...e, lendo: true }))
    try {
      const inicio = recente.current
      const etapaId = inicio.d.proxima
      const destino = inicio.d.localDe(etapaId)?.coordenadas
      if (!etapaId || !destino) return
      const r = await rotaDaPosicaoPrecisa(destino, { usarTransito: lerUsarTransito(), modo: 'reserva' })
      const agoraDoCiclo = relogio()
      // O que mudou durante a leitura (CHEGAMOS, SAÍMOS, desligar, segundo plano) vale mais que ela.
      const atual = recente.current
      if (!atual.ligado || !visivelAgora()) return
      const sit = situacaoDoAutomatico(
        atual.c.plano,
        atual.c.plano.viagem.planoOriginal!,
        atual.c.eventos,
        atual.d.localDe(atual.d.proxima)?.coordenadas !== undefined,
        agoraDoCiclo,
      )
      if (sit.situacao !== 'ativo' || sit.etapaId !== etapaId) return

      const adiar = () => truncarMinuto(proximoCiclo(agoraDoCiclo))
      if (!r.ok) {
        proximoEm.current = adiar()
        setEstado((e) => ({ ...e, falha: textoDaFalhaAutomatica(r.erro), tentaEm: proximoEm.current }))
        return
      }
      const previa = criarPrevia(r.rota, r.posicao.precisaoM, agoraDoCiclo)
      const decisao = decidirGravacao({
        plano: atual.c.plano,
        original: atual.c.plano.viagem.planoOriginal!,
        eventos: atual.c.eventos,
        etapaId,
        previa,
        fator: atual.c.plano.viagem.fatorOnibus,
        previsaoAtual: atual.d.chegadaProxima?.instante ?? null,
        agora: agoraDoCiclo,
      })
      proximoEm.current = adiar()
      if (!decisao.grava) {
        if (decisao.motivo === 'diferenca_pequena') {
          setEstado((e) => ({ ...e, ultimaEm: truncarMinuto(agoraDoCiclo), falha: null, tentaEm: null }))
        } else {
          setEstado((e) => ({ ...e, falha: textoDaFalhaAutomatica(decisao.motivo === 'impreciso' ? 'impreciso' : 'travada'), tentaEm: proximoEm.current }))
        }
        return
      }
      const gravado = await atual.c.repo.registrarEvento(atual.c.plano.viagem.id, {
        tipo: 'recalibracao',
        etapaId,
        dados: { horario: decisao.horario, origem: 'localizacao', calculadoEm: decisao.calculadoEm, servico: decisao.servico, automatica: true },
      })
      if (!gravado.ok) {
        setEstado((e) => ({ ...e, falha: gravado.motivo, tentaEm: proximoEm.current }))
        return
      }
      setEstado((e) => ({ ...e, ultimaEm: truncarMinuto(agoraDoCiclo), falha: null, tentaEm: null }))
      aoRegistrar?.()
      atual.c.recarregar()
    } catch (x) {
      proximoEm.current = truncarMinuto(proximoCiclo(relogio()))
      setEstado((e) => ({ ...e, falha: mensagemDeErroDoBanco(x, 'falha ao atualizar'), tentaEm: proximoEm.current }))
    } finally {
      emCurso.current = false
      setEstado((e) => ({ ...e, lendo: false }))
    }
  }

  // Mudou a viagem aberta: começa do zero.
  useEffect(() => {
    setEstado(INICIAL)
    proximoEm.current = null
  }, [plano.viagem.id, ligado])

  // O relógio do app redesenha a tela a cada minuto (e a demonstração, a cada mudança): é ele que
  // marca o ciclo. Pausado ou em segundo plano, esquece o ciclo para atualizar na hora ao voltar.
  const ativo = situacao.situacao === 'ativo'
  // Tela acesa só enquanto atualiza (em trânsito); pausado solta o bloqueio e volta a pedir ao ficar ativo.
  useWakeLock(ligado && ativo)
  useEffect(() => {
    if (!ligado) {
      proximoEm.current = null
      return
    }
    if (!ativo || !visivel) {
      proximoEm.current = null
      return
    }
    if (emCurso.current) return
    if (proximoEm.current && antes(relogio(), proximoEm.current)) return
    void ciclo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ligado, ativo, visivel, agora])

  const texto = ligado && situacao.situacao === 'pausado' ? textoDaPausa(situacao.motivo, d.nomeLocalParado) : null

  return { ligado, definir, situacao, estado, texto }
}
