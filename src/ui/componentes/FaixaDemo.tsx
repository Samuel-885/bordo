import { useState } from 'react'
import { avancarSimulado, correrSimulado, definirSimulado, pararSimulado, simuladoAtivo, simuladoCorrendo, type PassoRelogio } from '../../core/relogio'
import { CENARIOS, type Cenario } from '../../demo/cenarios'
import type { ExecutorNoBanco } from '../../demo/executorNoBanco'
import { horaValida, resolverHorarioProximo } from '../logica/horarioDigitado'
import { formatarHora } from '../logica/horarios'
import { avisarMudanca, useAgora } from '../useAgora'

interface Props {
  executor: ExecutorNoBanco | null
  onReiniciar: () => void
  onSair: () => void
  onEscolherCenario: (cenario: Cenario) => Promise<void>
}

const PASSOS: PassoRelogio[] = [5, 15, 60]

/** Sempre visível enquanto o relógio simulado está ligado; os controles abrem sob demanda. */
export function FaixaDemo({ executor, onReiniciar, onSair, onEscolherCenario }: Props) {
  const agora = useAgora()
  const [aberta, setAberta] = useState(false)
  const [hora, setHora] = useState('')
  const [falha, setFalha] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  if (!simuladoAtivo()) return null

  async function executar(acao: () => Promise<unknown>) {
    setOcupado(true)
    setFalha(null)
    try {
      await acao()
    } catch (x) {
      setFalha(x instanceof Error ? x.message : 'Não foi possível executar.')
    } finally {
      setOcupado(false)
      avisarMudanca()
    }
  }

  const proximo = executor?.proximoPasso ?? null

  return (
    <div className="faixa-demo" role="status">
      <div className="faixa-linha">
        <strong>
          MODO DEMONSTRAÇÃO <span className="mono">· {formatarHora(agora)}</span>
        </strong>
        <button type="button" className="botao pequeno" aria-expanded={aberta} onClick={() => setAberta((v) => !v)}>
          {aberta ? 'Fechar' : 'Controles'}
        </button>
        <button type="button" className="botao pequeno" onClick={onReiniciar}>
          Reiniciar
        </button>
        <button type="button" className="botao pequeno" onClick={onSair}>
          Sair
        </button>
      </div>

      {aberta && (
        <div className="faixa-painel">
          <div className="faixa-grupo">
            <span>Relógio</span>
            {PASSOS.map((m) => (
              <button
                key={m}
                type="button"
                className="botao pequeno"
                onClick={() => {
                  avancarSimulado(m)
                  avisarMudanca()
                }}
              >
                {m === 60 ? '+60 min' : `+${m} min`}
              </button>
            ))}
            <button
              type="button"
              className="botao pequeno"
              aria-pressed={simuladoCorrendo()}
              onClick={() => {
                if (simuladoCorrendo()) pararSimulado()
                else correrSimulado()
                avisarMudanca()
              }}
            >
              {simuladoCorrendo() ? 'Relógio correndo' : 'Relógio parado'}
            </button>
          </div>
          <form
            className="faixa-grupo"
            onSubmit={(e) => {
              e.preventDefault()
              const alvo = resolverHorarioProximo(hora, agora)
              if (!alvo) return
              definirSimulado(alvo)
              avisarMudanca()
            }}
          >
            <label htmlFor="demo-hora">Definir horário</label>
            <input id="demo-hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
            <button type="submit" className="botao pequeno" disabled={!horaValida(hora)}>
              Definir
            </button>
          </form>

          <div className="faixa-grupo">
            <label htmlFor="demo-cenario">Cenário</label>
            <select
              id="demo-cenario"
              disabled={ocupado}
              value={executor?.cenario.id ?? ''}
              onChange={(e) => {
                const c = CENARIOS.find((x) => x.id === e.target.value)
                if (c) void executar(() => onEscolherCenario(c))
              }}
            >
              <option value="" disabled>
                Escolha um cenário
              </option>
              {CENARIOS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>

          {executor && (
            <div className="faixa-cenario">
              <p>{executor.cenario.descricao}</p>
              {executor.modoLivre ? (
                <p>
                  <strong>Modo livre:</strong> registre com os botões da viagem. O cenário não avança mais sozinho.
                </p>
              ) : proximo ? (
                <p>
                  Passo {executor.passo + 1} de {executor.totalPassos}: {proximo.descricao}
                </p>
              ) : (
                <p>Cenário concluído ({executor.totalPassos} passos).</p>
              )}
              <div className="faixa-grupo">
                <button
                  type="button"
                  className="botao pequeno principal"
                  disabled={ocupado || !proximo}
                  onClick={() => void executar(() => executor.avancarPasso())}
                >
                  Próximo passo
                </button>
                <button type="button" className="botao pequeno" disabled={ocupado} onClick={() => void executar(() => onEscolherCenario(executor.cenario))}>
                  Reiniciar cenário
                </button>
              </div>
            </div>
          )}
          {falha && <p className="msg-erro">{falha}</p>}
        </div>
      )}
    </div>
  )
}
