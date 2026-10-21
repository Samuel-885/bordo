// Tela de conferência de passageiros. Só guarda o que a pessoa tocou: as regras (estado
// inicial, quadro, contagem, sair sem todos) vêm do núcleo e o resultado vira evento no
// repositório.

import { useState } from 'react'
import {
  alternarPassageiro,
  aplicarContagem,
  avisoDaMarcacao as textoDoAvisoDaMarcacao,
  decisoesCompletas,
  iniciarConferencia,
  listaParaTela,
  modoPadrao,
  pendentesDa,
  podeSair,
  quadroDeSituacao,
  type ContextoConferencia,
  type DecisaoDePendente,
  type EstadoConferencia,
} from '../core/conferencia'
import type { Etapa, ModoConferencia, StatusPassageiro } from '../core/tipos'
import { Folha } from './componentes/Folha'
import { Topo } from './componentes/Topo'
import { textoDeQuemFalta } from './logica/passageiros'
import { useWakeLock } from './useWakeLock'

interface Props {
  contexto: ContextoConferencia
  etapa: Pick<Etapa, 'tipo' | 'categoria' | 'modoConferencia'>
  etapas: readonly Etapa[]
  /** "Saída de Monlevade" ou "Volta à estrada". */
  titulo: string
  /** Texto do botão que confirma: SAÍMOS ou VOLTAMOS. */
  rotuloSair: string
  /** Quem foi marcado como "desceu" nesta parada, se houve marcação. */
  desceram: string[] | null
  ocupado: boolean
  erro: string | null
  onConfirmar: (estado: EstadoConferencia, decisoes: DecisaoDePendente[]) => void
  onFechar: () => void
}

const MODOS: Array<{ valor: ModoConferencia; rotulo: string }> = [
  { valor: 'todos_desceram', rotulo: 'Todos desceram' },
  { valor: 'so_alguns', rotulo: 'Só alguns' },
]

const STATUS: Array<{ valor: Exclude<StatusPassageiro, 'ativo'>; rotulo: string }> = [
  { valor: 'nao_embarcou', rotulo: 'Não embarcou' },
  { valor: 'saiu_da_viagem', rotulo: 'Saiu da viagem' },
]

export function Conferencia({ contexto, etapa, etapas, titulo, rotuloSair, desceram, ocupado, erro, onConfirmar, onFechar }: Props) {
  useWakeLock(true)
  const [estado, setEstado] = useState<EstadoConferencia>(() =>
    iniciarConferencia(contexto, etapas, modoPadrao(etapa, contexto.momento), etapa, desceram),
  )
  /** O aviso vale enquanto a lista é a que veio da marcação. */
  const [avisoDaMarcacao, setAvisoDaMarcacao] = useState<string | null>(() =>
    desceram === null ? null : textoDoAvisoDaMarcacao(desceram.length, estado.confirmados.length),
  )
  const [digitado, setDigitado] = useState('')
  const [resposta, setResposta] = useState<string | null>(null)
  const [semTodos, setSemTodos] = useState(false)
  const [decisoes, setDecisoes] = useState<DecisaoDePendente[]>([])

  const quadro = quadroDeSituacao(contexto, estado)
  const pendentes = pendentesDa(contexto, estado)
  const lista = listaParaTela(contexto, estado)

  function trocarModo(modo: ModoConferencia) {
    setEstado(iniciarConferencia(contexto, etapas, modo, etapa))
    setAvisoDaMarcacao(null)
    setResposta(null)
  }

  function contar() {
    if (digitado.trim() === '' || !/^\d+$/.test(digitado.trim())) {
      setResposta('Digite o número de pessoas a bordo.')
      return
    }
    const r = aplicarContagem(contexto, estado, Number(digitado))
    setEstado(r.estado)
    if (r.resposta.completa) {
      setResposta('A contagem confere: todos confirmados.')
    } else {
      const { diferenca, sentido } = r.resposta
      setResposta(
        `${sentido === 'faltando' ? 'Faltam' : 'Sobram'} ${diferenca} ${diferenca === 1 ? 'pessoa' : 'pessoas'} em relação aos ${contexto.esperados.length} esperados. Confira por nome.`,
      )
    }
  }

  function abrirSemTodos() {
    setDecisoes(pendentes.map((p) => ({ passageiroId: p.id, status: null, motivo: '' })))
    setSemTodos(true)
  }

  const mudarDecisao = (id: string, parte: Partial<DecisaoDePendente>) =>
    setDecisoes((atual) => atual.map((d) => (d.passageiroId === id ? { ...d, ...parte } : d)))

  return (
    <>
      <Topo titulo={titulo} onVoltar={onFechar} rotuloVoltar="Voltar sem registrar" />
      <main className="conteudo conferencia">
        <section
          className={`cartao quadro-conferencia ${quadro.todosABordo ? 'completo' : 'atencao'}`}
          aria-label="Situação da conferência"
          aria-live="polite"
        >
          {quadro.todosABordo ? (
            <p className="linha-grande">
              <strong>TODOS A BORDO</strong> <span className="mono">{quadro.confirmados}/{quadro.total}</span>
            </p>
          ) : (
            <>
              <p className="linha-grande">
                <strong>ATENÇÃO</strong> <span className="mono">{quadro.confirmados}/{quadro.total}</span>
              </p>
              <p>Falta: {textoDeQuemFalta(quadro.faltam)}</p>
            </>
          )}
        </section>

        <div className="seletor-modo" role="group" aria-label="Modo da conferência">
          {MODOS.map((m) => (
            <button
              key={m.valor}
              type="button"
              className={`botao ${estado.modo === m.valor ? 'principal' : ''}`}
              aria-pressed={estado.modo === m.valor}
              onClick={() => trocarModo(m.valor)}
            >
              {m.rotulo}
            </button>
          ))}
        </div>
        <p className="dica">Trocar o modo reinicia a lista.</p>
        {avisoDaMarcacao && (
          <p className="aviso" role="note">
            {avisoDaMarcacao}
          </p>
        )}

        <section className="cartao" aria-label="Contagem rápida">
          <div className="campo">
            <label htmlFor="contagem">Contagem rápida: quantos estão a bordo?</label>
            <div className="linha-contagem">
              <input
                id="contagem"
                inputMode="numeric"
                pattern="[0-9]*"
                value={digitado}
                onChange={(e) => setDigitado(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), contar())}
                autoComplete="off"
              />
              <button type="button" className="botao" onClick={contar}>
                Conferir
              </button>
            </div>
          </div>
          {resposta && <p role="status">{resposta}</p>}
        </section>

        <ul className="lista-conferencia" aria-label="Passageiros">
          {lista.map(({ passageiro, confirmado }) => (
            <li key={passageiro.id}>
              <button
                type="button"
                className={`passageiro-item ${confirmado ? 'confirmado' : 'pendente'}`}
                aria-pressed={confirmado}
                onClick={() => setEstado(alternarPassageiro(estado, passageiro.id))}
              >
                <span aria-hidden="true">{confirmado ? '✓' : '○'}</span>
                <span>{passageiro.nome}</span>
              </button>
            </li>
          ))}
        </ul>
        {lista.length === 0 && <p className="dica">Nenhum passageiro esperado a bordo neste ponto.</p>}

        {erro && !semTodos && <p className="msg-erro" role="alert">{erro}</p>}

        <div className="rodape-conferencia">
          <button
            type="button"
            className="botao-principal"
            disabled={ocupado || !podeSair(contexto, estado)}
            onClick={() => onConfirmar(estado, [])}
          >
            {rotuloSair}
          </button>
          {pendentes.length > 0 && (
            <button type="button" className="botao largo" disabled={ocupado} onClick={abrirSemTodos}>
              Sair sem todos
            </button>
          )}
        </div>
      </main>

      <Folha
        aberta={semTodos}
        titulo="Sair sem todos"
        rotuloConfirmar={`${rotuloSair} sem eles`}
        ocupado={ocupado}
        erro={erro}
        podeConfirmar={decisoesCompletas(pendentes, decisoes)}
        onCancelar={() => setSemTodos(false)}
        onConfirmar={() => onConfirmar(estado, decisoes)}
      >
        <p className="dica">Cada pessoa que ficou precisa de um status e de um motivo. Assim a contagem seguinte continua certa.</p>
        <div className="decisoes">
          {pendentes.map((p) => {
            const d = decisoes.find((x) => x.passageiroId === p.id)
            return (
              <fieldset key={p.id} className="opcoes">
                <legend>{p.nome}</legend>
                {STATUS.map((s) => (
                  <label key={s.valor} className="opcao">
                    <input
                      type="radio"
                      name={`status-${p.id}`}
                      checked={d?.status === s.valor}
                      onChange={() => mudarDecisao(p.id, { status: s.valor })}
                    />
                    {s.rotulo}
                  </label>
                ))}
                <div className="campo">
                  <label htmlFor={`motivo-${p.id}`}>Motivo</label>
                  <input
                    id={`motivo-${p.id}`}
                    value={d?.motivo ?? ''}
                    onChange={(e) => mudarDecisao(p.id, { motivo: e.target.value })}
                    autoComplete="off"
                  />
                </div>
              </fieldset>
            )
          })}
        </div>
      </Folha>
    </>
  )
}
