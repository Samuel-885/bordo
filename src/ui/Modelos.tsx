// Modelos de mensagem: o texto de cada mensagem (atualização e restaurante), com variáveis
// entre chaves que o app preenche ao gerar. A lista de variáveis insere no cursor, a prévia é
// ao vivo (viagem em andamento ou valores de exemplo) e "Voltar ao padrão" apaga o salvo.

import { useEffect, useRef, useState } from 'react'
import {
  MODELO_PADRAO,
  TITULO_DO_MODELO,
  VARIAVEIS_DO_MODELO,
  preencherModelo,
  validarModelo,
  variaveisDesconhecidas,
  type IdModelo,
} from '../core/modelos'
import { calcularEstado } from '../core/previsao'
import { avaliarAlternativas, paradasFlexiveisPendentes } from '../core/viabilidade'
import { ordenarPor } from '../core/tempo'
import type { Repositorio } from '../data/repositorio'
import { mensagemDeErroDoBanco } from '../data/avisoBanco'
import { Confirmar } from './componentes/Confirmar'
import { Topo } from './componentes/Topo'
import { valoresDaAtualizacao, valoresDeExemplo, valoresDoRestaurante, type Valores } from './logica/mensagens'
import { useAgora, useAoMudar } from './useAgora'
import { useDados } from './useDados'

interface Props {
  repo: Repositorio
  /** A viagem da prévia ao vivo; vazio = a viagem em andamento mais recente, se houver. */
  viagemId: string | null
  onVoltar: () => void
}

const IDS: IdModelo[] = ['atualizacao', 'restaurante']

export function Modelos({ repo, viagemId, onVoltar }: Props) {
  const { dados, erro, recarregar } = useDados(async () => {
    const modelos = await repo.obterModelos()
    const viagens = await repo.listarViagens()
    const escolhida =
      viagens.find((v) => v.id === viagemId && v.status === 'em_andamento') ??
      ordenarPor(viagens.filter((v) => v.status === 'em_andamento'), (v) => v.dataSaida).at(-1)
    if (!escolhida) return { modelos, viagem: null }
    const [plano, eventos, passageiros, consultas] = await Promise.all([
      repo.carregarPlano(escolhida.id),
      repo.listarEventos(escolhida.id),
      repo.listarPassageiros(escolhida.id),
      repo.listarConsultas(escolhida.id),
    ])
    return { modelos, viagem: plano ? { plano, eventos, passageiros, consultas } : null }
  }, `modelos:${repo.espaco}:${viagemId ?? ''}`)
  useAoMudar(recarregar)
  const agora = useAgora()

  if (erro) {
    return (
      <>
        <Topo titulo="Modelos de mensagem" onVoltar={onVoltar} />
        <main className="conteudo"><p className="msg-erro">{erro}</p></main>
      </>
    )
  }
  if (!dados) return <Topo titulo="Modelos de mensagem" onVoltar={onVoltar} />
  return <Editor repo={repo} dados={dados} agora={agora} onVoltar={onVoltar} />
}

interface Dados {
  modelos: Record<IdModelo, string | null>
  viagem: ViagemDaPrevia | null
}
type ViagemDaPrevia = {
  plano: NonNullable<Awaited<ReturnType<Repositorio['carregarPlano']>>>
  eventos: Awaited<ReturnType<Repositorio['listarEventos']>>
  passageiros: Awaited<ReturnType<Repositorio['listarPassageiros']>>
  consultas: Awaited<ReturnType<Repositorio['listarConsultas']>>
}

function Editor({
  repo, dados, agora, onVoltar,
}: {
  repo: Repositorio
  dados: Dados
  agora: ReturnType<typeof useAgora>
  onVoltar: () => void
}) {
  const [aba, setAba] = useState<IdModelo>('atualizacao')
  const [rascunhos, setRascunhos] = useState<Record<IdModelo, string>>({
    atualizacao: dados.modelos.atualizacao ?? MODELO_PADRAO.atualizacao,
    restaurante: dados.modelos.restaurante ?? MODELO_PADRAO.restaurante,
  })
  const [salvos, setSalvos] = useState<Record<IdModelo, string | null>>(dados.modelos)
  const [retorno, setRetorno] = useState<{ texto: string; erro: boolean } | null>(null)
  const [restaurando, setRestaurando] = useState(false)
  const campo = useRef<HTMLTextAreaElement>(null)
  const cursor = useRef<number | null>(null)

  const texto = rascunhos[aba]
  const desconhecidas = variaveisDesconhecidas(texto, VARIAVEIS_DO_MODELO[aba])
  const validacao = validarModelo(aba, texto)
  const igualAoSalvo = texto === (salvos[aba] ?? MODELO_PADRAO[aba])

  useEffect(() => {
    if (cursor.current === null || !campo.current) return
    campo.current.focus()
    campo.current.setSelectionRange(cursor.current, cursor.current)
    cursor.current = null
  })

  function editar(novo: string) {
    setRetorno(null)
    setRascunhos((r) => ({ ...r, [aba]: novo }))
  }

  function inserir(nome: string) {
    const c = campo.current
    const inicio = c?.selectionStart ?? texto.length
    const fim = c?.selectionEnd ?? texto.length
    const variavel = `{${nome}}`
    cursor.current = inicio + variavel.length
    editar(texto.slice(0, inicio) + variavel + texto.slice(fim))
  }

  async function salvar() {
    try {
      const r = await repo.salvarModelo(aba, texto)
      if (!r.ok) return setRetorno({ texto: r.motivo, erro: true })
      setSalvos((s) => ({ ...s, [aba]: texto }))
      setRetorno({ texto: 'Modelo salvo.', erro: false })
    } catch (x) {
      setRetorno({ texto: mensagemDeErroDoBanco(x, 'Não foi possível salvar.'), erro: true })
    }
  }

  async function voltarAoPadrao() {
    setRestaurando(false)
    try {
      await repo.restaurarModelo(aba)
      setRascunhos((r) => ({ ...r, [aba]: MODELO_PADRAO[aba] }))
      setSalvos((s) => ({ ...s, [aba]: null }))
      setRetorno({ texto: 'Voltou ao modelo padrão.', erro: false })
    } catch (x) {
      setRetorno({ texto: mensagemDeErroDoBanco(x, 'Não foi possível restaurar.'), erro: true })
    }
  }

  const { valores, origem } = valoresDaPrevia(aba, dados.viagem, agora)
  const previa = preencherModelo(texto, valores)

  return (
    <>
      <Topo titulo="Modelos de mensagem" onVoltar={onVoltar} />
      <main className="conteudo">
        <div className="modelo-abas" role="tablist" aria-label="Modelo">
          {IDS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={aba === id}
              className="botao"
              onClick={() => { setRetorno(null); setAba(id) }}
            >
              {TITULO_DO_MODELO[id]}
            </button>
          ))}
        </div>

        <section className="cartao" aria-label="Texto do modelo">
          <div className="campo">
            <label htmlFor="modelo-texto">Texto do modelo</label>
            <textarea id="modelo-texto" ref={campo} rows={11} value={texto} onChange={(e) => editar(e.target.value)} />
          </div>
          {desconhecidas.length > 0 && (
            <p className="msg-erro" role="alert">
              {desconhecidas.length === 1 ? 'Variável desconhecida' : 'Variáveis desconhecidas'}: {desconhecidas.map((n) => `{${n}}`).join(', ')}. Corrija para salvar.
            </p>
          )}
          {retorno && <p className={retorno.erro ? 'msg-erro' : 'dica'} role="status">{retorno.texto}</p>}
          <div className="acoes">
            <button type="button" className="botao principal" disabled={!validacao.ok || igualAoSalvo} onClick={() => void salvar()}>
              SALVAR
            </button>
            <button type="button" className="botao" disabled={salvos[aba] === null && texto === MODELO_PADRAO[aba]} onClick={() => setRestaurando(true)}>
              Voltar ao padrão
            </button>
          </div>
        </section>

        <section className="cartao" aria-label="Variáveis">
          <h2>Variáveis (toque para inserir)</h2>
          <ul className="variaveis">
            {VARIAVEIS_DO_MODELO[aba].map((v) => (
              <li key={v.nome}>
                <button type="button" className="botao pequeno" onClick={() => inserir(v.nome)}>{`{${v.nome}}`}</button>
                <span>{v.descricao}</span>
              </li>
            ))}
          </ul>
          <p className="dica">Linha com variável vazia é removida inteira. Nenhuma variável traz nomes de passageiros.</p>
        </section>

        <section className="cartao" aria-label="Prévia">
          <h2>Prévia ({origem})</h2>
          <pre className="previa-modelo">{previa}</pre>
        </section>
      </main>

      <Confirmar
        aberto={restaurando}
        titulo="Voltar ao modelo padrão?"
        rotuloConfirmar="Voltar ao padrão"
        perigo
        onConfirmar={() => void voltarAoPadrao()}
        onCancelar={() => setRestaurando(false)}
      >
        <p>O texto do modelo {TITULO_DO_MODELO[aba].toLowerCase()} que você editou será apagado.</p>
      </Confirmar>
    </>
  )
}

/** Os valores da prévia: os da viagem em andamento quando dá, senão os de exemplo. */
function valoresDaPrevia(
  id: IdModelo,
  viagem: ViagemDaPrevia | null,
  agora: ReturnType<typeof useAgora>,
): { valores: Valores; origem: 'viagem atual' | 'exemplo' } {
  const exemplo = { valores: valoresDeExemplo(id), origem: 'exemplo' as const }
  const original = viagem?.plano.viagem.planoOriginal
  if (!viagem || !original) return exemplo
  const { plano, eventos, passageiros, consultas } = viagem
  if (id === 'atualizacao') {
    return { valores: valoresDaAtualizacao(plano, eventos, passageiros, agora), origem: 'viagem atual' }
  }
  const estado = calcularEstado(plano, original, eventos, agora)
  const etapa = paradasFlexiveisPendentes(plano, estado)[0]
  if (!etapa) return exemplo
  const escolhida = avaliarAlternativas(plano, original, eventos, agora, etapa.id, consultas).find((a) => a.escolhida)
  if (!escolhida?.chegada) return exemplo
  const r = valoresDoRestaurante(plano, eventos, passageiros, etapa.id, escolhida.localId, escolhida.chegada, agora)
  return r.grupo > 0 ? { valores: r.valores, origem: 'viagem atual' } : exemplo
}
