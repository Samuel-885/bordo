// Folhas (painéis de baixo) da tela principal e da timeline. Só coletam o que foi digitado;
// resolver o horário e validar as travas fica por conta do núcleo, via repositório.

import { useState } from 'react'
import type { MotivoParada, TipoImprevisto, Instante } from '../core/tipos'
import { MAX_OBSERVACAO, MAX_ONDE_PARADA, MAX_TEMPO_PREVISTO_MIN, normalizarOnde, rotuloHorario, type LimitesHorario } from '../core/registro'
import { CampoHora } from './componentes/CampoHora'
import { Folha } from './componentes/Folha'
import { horaValida, resolverHorarioPassado, resolverHorarioProximo } from './logica/horarioDigitado'
import { formatarHora } from './logica/horarios'
import { MOTIVOS_DE_PARADA, TIPOS_DE_IMPREVISTO } from './logica/rotulos'

interface Comum {
  aberta: boolean
  ocupado: boolean
  erro: string | null
  agora: Instante
  onCancelar: () => void
}

/** O que a folha da parada devolve: só o que foi digitado, já sem espaços sobrando; o núcleo valida. */
export interface DadosDaParada {
  motivo?: MotivoParada
  onde?: string
  tempoPrevistoMin?: number
}

/** "" = sem tempo previsto; só dígitos vira número; o resto vira NaN, que o núcleo recusa com a mensagem. */
const lerTempoPrevisto = (texto: string): number | undefined => {
  const t = texto.trim()
  if (t === '') return undefined
  return /^\d+$/.test(t) ? Number(t) : Number.NaN
}

function CamposOndeETempo({ onde, tempo, onOnde, onTempo }: { onde: string; tempo: string; onOnde: (v: string) => void; onTempo: (v: string) => void }) {
  return (
    <>
      <div className="campo">
        <label htmlFor="parada-onde">Onde (opcional)</label>
        <input id="parada-onde" type="text" maxLength={MAX_ONDE_PARADA} value={onde} onChange={(e) => onOnde(e.target.value)} />
        <p className="dica">Nome do lugar. Sem nomes de passageiros.</p>
      </div>
      <div className="campo">
        <label htmlFor="parada-tempo">Tempo previsto, em minutos (opcional)</label>
        <input id="parada-tempo" type="text" inputMode="numeric" value={tempo} onChange={(e) => onTempo(e.target.value)} />
        <p className="dica">De 1 a {MAX_TEMPO_PREVISTO_MIN}. A previsão já conta esse tempo e passa a acompanhar o relógio se estourar.</p>
      </div>
    </>
  )
}

const dadosDigitados = (onde: string, tempo: string): Pick<DadosDaParada, 'onde' | 'tempoPrevistoMin'> => {
  const o = normalizarOnde(onde)
  const t = lerTempoPrevisto(tempo)
  return { ...(o !== undefined ? { onde: o } : {}), ...(t !== undefined ? { tempoPrevistoMin: t } : {}) }
}

export function FolhaParada({ aberta, ocupado, erro, onConfirmar, onCancelar }: Omit<Comum, 'agora'> & { onConfirmar: (dados: DadosDaParada) => void }) {
  const [motivo, setMotivo] = useState<MotivoParada | ''>('')
  const [onde, setOnde] = useState('')
  const [tempo, setTempo] = useState('')
  return (
    <Folha aberta={aberta} titulo="PARAMOS" rotuloConfirmar="Registrar parada" ocupado={ocupado} erro={erro} onCancelar={onCancelar} onConfirmar={() => onConfirmar({ ...(motivo ? { motivo } : {}), ...dadosDigitados(onde, tempo) })}>
      <fieldset className="opcoes">
        <legend>Motivo (opcional)</legend>
        {MOTIVOS_DE_PARADA.map((m) => (
          <label key={m.valor} className="opcao">
            <input type="radio" name="motivo-parada" checked={motivo === m.valor} onChange={() => setMotivo(m.valor)} />
            {m.rotulo}
          </label>
        ))}
        <label className="opcao">
          <input type="radio" name="motivo-parada" checked={motivo === ''} onChange={() => setMotivo('')} />
          Sem motivo
        </label>
      </fieldset>
      <CamposOndeETempo onde={onde} tempo={tempo} onOnde={setOnde} onTempo={setTempo} />
    </Folha>
  )
}

/** Com a parada aberta: corrige o lugar e o tempo previsto. Apagar um campo tira o valor. */
export function FolhaAjusteDaParada({
  aberta, ocupado, erro, inicial, onConfirmar, onCancelar,
}: Omit<Comum, 'agora'> & { inicial: { onde?: string; tempoPrevistoMin?: number }; onConfirmar: (dados: Pick<DadosDaParada, 'onde' | 'tempoPrevistoMin'>) => void }) {
  const [onde, setOnde] = useState(inicial.onde ?? '')
  const [tempo, setTempo] = useState(inicial.tempoPrevistoMin !== undefined ? String(inicial.tempoPrevistoMin) : '')
  return (
    <Folha aberta={aberta} titulo="Parada não planejada" rotuloConfirmar="Salvar" ocupado={ocupado} erro={erro} onCancelar={onCancelar} onConfirmar={() => onConfirmar(dadosDigitados(onde, tempo))}>
      <CamposOndeETempo onde={onde} tempo={tempo} onOnde={setOnde} onTempo={setTempo} />
    </Folha>
  )
}

export function FolhaImprevisto({
  aberta, ocupado, erro, agora, onConfirmar, onCancelar,
  emViagem, onUsarParamos,
}: Comum & {
  /** Em viagem, oferece ir direto ao PARAMOS. */
  emViagem: boolean
  onUsarParamos: () => void
  onConfirmar: (dados: { horario: Instante; categoria: TipoImprevisto; observacao: string }) => void
}) {
  const [hora, setHora] = useState(() => formatarHora(agora))
  const [categoria, setCategoria] = useState<TipoImprevisto>('transito')
  const [observacao, setObservacao] = useState('')
  const resolvido = resolverHorarioPassado(hora, agora)
  return (
    <Folha
      aberta={aberta}
      titulo="Registrar imprevisto"
      rotuloConfirmar="Registrar"
      ocupado={ocupado}
      erro={erro}
      podeConfirmar={resolvido !== null}
      onCancelar={onCancelar}
      onConfirmar={() => resolvido && onConfirmar({ horario: resolvido, categoria, observacao: observacao.trim() })}
    >
      <div className="aviso-paramos">
        <p>O ônibus está parado? Use PARAMOS para a previsão contar o tempo parado.</p>
        {emViagem && (
          <button type="button" className="botao pequeno" onClick={onUsarParamos}>
            Usar PARAMOS
          </button>
        )}
      </div>
      <CampoHora id="imprevisto-hora" rotulo="Horário" valor={hora} onMudar={setHora} resolvido={resolvido} agora={agora} />
      <div className="campo">
        <label htmlFor="imprevisto-tipo">Tipo</label>
        <select id="imprevisto-tipo" value={categoria} onChange={(e) => setCategoria(e.target.value as TipoImprevisto)}>
          {TIPOS_DE_IMPREVISTO.map((t) => (
            <option key={t.valor} value={t.valor}>{t.rotulo}</option>
          ))}
        </select>
      </div>
      <div className="campo">
        <label htmlFor="imprevisto-obs">Observação (curta)</label>
        <input id="imprevisto-obs" type="text" maxLength={140} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
        <p className="dica">Sem nomes de passageiros.</p>
      </div>
    </Folha>
  )
}

export function FolhaRecalibracao({
  aberta, ocupado, erro, agora, linkMapa, nomeEtapa, titulo = 'Atualizar previsão', rotuloConfirmar = 'Atualizar', dica, onConfirmar, onCancelar,
}: Comum & {
  linkMapa: string | null
  nomeEtapa: string
  /** Troca de local com a chegada informada: título, botão e dica próprios. */
  titulo?: string
  rotuloConfirmar?: string
  dica?: string
  onConfirmar: (horario: Instante) => void
}) {
  const [hora, setHora] = useState('')
  const resolvido = resolverHorarioProximo(hora, agora)
  return (
    <Folha
      aberta={aberta}
      titulo={titulo}
      rotuloConfirmar={rotuloConfirmar}
      ocupado={ocupado}
      erro={erro}
      podeConfirmar={resolvido !== null}
      onCancelar={onCancelar}
      onConfirmar={() => resolvido && onConfirmar(resolvido)}
    >
      <p className="dica">{dica ?? `Abra o Google Maps, veja o horário de chegada em ${nomeEtapa} e digite aqui.`}</p>
      {linkMapa && (
        <a className="botao largo link-botao" href={linkMapa} target="_blank" rel="noopener noreferrer">
          ABRIR NO GOOGLE MAPS
        </a>
      )}
      <CampoHora id="recalibracao-hora" rotulo="Chegada informada pelo Google Maps" valor={hora} onMudar={setHora} resolvido={resolvido} agora={agora} />
    </Folha>
  )
}

/** Pede um horário que não seja depois de agora: volta à estrada, correção de chegada ou saída. */
export function FolhaHorario({
  aberta, ocupado, erro, agora, titulo, rotulo, inicial, dica, limites, onConfirmar, onCancelar,
}: Comum & {
  titulo: string
  rotulo: string
  inicial: string
  dica?: string
  limites?: LimitesHorario
  onConfirmar: (horario: Instante) => void
}) {
  const [hora, setHora] = useState(inicial)
  const resolvido = resolverHorarioPassado(hora, agora)
  return (
    <Folha
      aberta={aberta}
      titulo={titulo}
      rotuloConfirmar="Confirmar"
      ocupado={ocupado}
      erro={erro}
      podeConfirmar={resolvido !== null && horaValida(hora)}
      onCancelar={onCancelar}
      onConfirmar={() => resolvido && onConfirmar(resolvido)}
    >
      <CampoHora id="folha-hora" rotulo={rotulo} valor={hora} onMudar={setHora} resolvido={resolvido} agora={agora} dica={dica} />
      {limites && (
        <p className="dica">
          {limites.minimo ? `Não antes de ${rotuloHorario(limites.minimo.instante, agora)}. ` : ''}
          Não depois de {rotuloHorario(limites.maximo.instante, agora)}.
        </p>
      )}
    </Folha>
  )
}

/**
 * Observação livre (OBSERVAÇÃO na tela principal) ou a correção de uma já registrada pela
 * timeline. O horário começa no informado e pode ser anterior (mesma regra do imprevisto).
 */
export function FolhaObservacao({
  aberta, ocupado, erro, agora, onConfirmar, onCancelar,
  titulo = 'Observação', rotuloConfirmar = 'Registrar', textoInicial = '', horaInicial,
}: Comum & {
  titulo?: string
  rotuloConfirmar?: string
  textoInicial?: string
  horaInicial?: string
  onConfirmar: (dados: { horario: Instante; texto: string }) => void
}) {
  const [hora, setHora] = useState(() => horaInicial ?? formatarHora(agora))
  const [texto, setTexto] = useState(textoInicial)
  const resolvido = resolverHorarioPassado(hora, agora)
  return (
    <Folha
      aberta={aberta}
      titulo={titulo}
      rotuloConfirmar={rotuloConfirmar}
      ocupado={ocupado}
      erro={erro}
      podeConfirmar={resolvido !== null && texto.trim() !== '' && texto.length <= MAX_OBSERVACAO}
      onCancelar={onCancelar}
      onConfirmar={() => resolvido && onConfirmar({ horario: resolvido, texto: texto.trim() })}
    >
      <CampoHora id="observacao-hora" rotulo="Horário" valor={hora} onMudar={setHora} resolvido={resolvido} agora={agora} />
      <div className="campo">
        <label htmlFor="observacao-texto">Observação</label>
        <textarea
          id="observacao-texto"
          rows={5}
          maxLength={MAX_OBSERVACAO}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <p className="contador">{texto.length}/{MAX_OBSERVACAO}</p>
        <p className="dica">Fica só no celular. Não entra nas mensagens automáticas.</p>
      </div>
    </Folha>
  )
}
