// "Calcular tempos" (fase 8): busca tempo e distância de carro de cada trecho com coordenadas nos
// dois locais e guarda como fonte "rota". Só no planejamento, com internet. Tempo manual não é
// sobrescrito: a rota fica ao lado dele, e a tela do trecho deixa a pessoa escolher.

import { useEffect, useRef, useState } from 'react'
import { locaisSemCoordenadas, paresParaCalcular } from '../core/rotas'
import type { DadosPlano } from '../core/tipos'
import type { Repositorio } from '../data/repositorio'
import { mensagemDeErroDoBanco } from '../data/avisoBanco'
import { calcularLote } from '../servicos/rotas'
import { textoDoErroDeRota } from './logica/servicos'
import { useOnline } from './useOnline'

interface Props {
  plano: DadosPlano
  repo: Repositorio
  /** Recarrega o plano depois de gravar rotas. */
  onAtualizar: () => void
  onEditarLocal: (localId: string) => void
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

export function CalculoDeRotas({ plano, repo, onAtualizar, onEditarLocal }: Props) {
  const online = useOnline()
  const { calcular, semCoordenadas } = paresParaCalcular(plano)
  const faltamCoordenadas = locaisSemCoordenadas(plano, semCoordenadas)
  const [andamento, setAndamento] = useState<{ feitos: number; total: number } | null>(null)
  const [mensagem, setMensagem] = useState<{ texto: string; erro: boolean } | null>(null)
  const parar = useRef<AbortController | null>(null)
  useEffect(() => () => parar.current?.abort(), [])

  const nome = (id: string) => plano.locais.find((l) => l.id === id)?.nome ?? 'local'
  const temRota = plano.trechos.some((t) => t.fonte === 'rota' || t.rota)

  async function calcularTempos() {
    setMensagem(null)
    if (calcular.length === 0) {
      return setMensagem({ texto: 'Nenhum trecho tem coordenadas nos dois locais. Cadastre as coordenadas em Locais.', erro: true })
    }
    if (!navigator.onLine) return setMensagem({ texto: `${textoDoErroDeRota('sem_internet')} Os tempos já guardados continuam valendo.`, erro: true })
    const controle = new AbortController()
    parar.current = controle
    setAndamento({ feitos: 0, total: calcular.length })
    try {
      const r = await calcularLote(calcular, {
        sinal: controle.signal,
        aoCalcular: (par, rota) => repo.salvarRotaDoTrecho(plano.viagem.id, par, rota),
        aoAndamento: (feitos, total) => setAndamento({ feitos, total }),
      })
      const partes: string[] = [`${plural(r.calculados, 'trecho calculado', 'trechos calculados')}.`]
      if (r.semRota.length > 0) {
        partes.push(`Sem rota encontrada: ${r.semRota.map((p) => `${nome(p.localOrigemId)} → ${nome(p.localDestinoId)}`).join('; ')}. Digite o tempo à mão.`)
      }
      if (r.interrompido) {
        partes.push(
          r.interrompido.erro === 'cancelado'
            ? `Cancelado: ${plural(r.interrompido.restantes, 'trecho ficou', 'trechos ficaram')} sem calcular.`
            : `${textoDoErroDeRota(r.interrompido.erro)} ${plural(r.interrompido.restantes, 'trecho ficou', 'trechos ficaram')} sem calcular: tente de novo mais tarde ou digite o tempo à mão.`,
        )
      }
      setMensagem({ texto: partes.join(' '), erro: r.interrompido !== null && r.interrompido.erro !== 'cancelado' })
    } catch (x) {
      setMensagem({ texto: mensagemDeErroDoBanco(x, 'Não foi possível guardar as rotas.'), erro: true })
    } finally {
      if (parar.current === controle) parar.current = null
      setAndamento(null)
      onAtualizar()
    }
  }

  return (
    <section className="cartao calculo-rotas" aria-label="Tempos pela rota">
      <h2>Tempos pela rota</h2>
      <p className="dica">
        Tempo de carro pelo OSRM público (dados do OpenStreetMap), multiplicado pelo fator ônibus. Só aqui no planejamento, com internet: na viagem nada
        depende de rede. Tempo digitado à mão nunca é trocado, e o do roteiro continua valendo primeiro.
      </p>
      {andamento ? (
        <div className="calculo-andamento" role="status">
          <span>
            Calculando {Math.min(andamento.feitos + 1, andamento.total)} de {andamento.total}…
          </span>
          <button type="button" className="botao pequeno" onClick={() => parar.current?.abort()}>
            Cancelar
          </button>
        </div>
      ) : (
        <button type="button" className="botao principal largo" onClick={() => void calcularTempos()}>
          Calcular tempos
        </button>
      )}
      <p className="dica">
        {plural(calcular.length, 'trecho com coordenadas', 'trechos com coordenadas')}
        {temRota ? ' (refaz também os já calculados pela rota)' : ''}.
      </p>
      {!online && <p className="dica atencao-texto">Sem internet ou sinal fraco: o cálculo precisa de conexão.</p>}
      {mensagem && (
        <p className={mensagem.erro ? 'msg-erro' : 'dica'} role="status">
          {mensagem.texto}
        </p>
      )}
      {faltamCoordenadas.length > 0 && (
        <div className="calculo-sem-coordenadas">
          <p className="dica">
            <strong>Sem coordenadas, sem rota:</strong> cadastre as coordenadas para calcular os trechos destes locais.
          </p>
          {faltamCoordenadas.map((id) => (
            <button key={id} type="button" className="link" onClick={() => onEditarLocal(id)}>
              {nome(id)}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
