// Mudança de roteiro em viagem: incluir uma parada nova ou trocar o local de uma parada flexível
// por um local novo. Tela cheia, aberta por cima da viagem. O núcleo (`core/inclusao.ts`) valida e
// calcula a prévia; aqui só há o formulário. Nada é estimado: sem tempo, não inclui.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  CATEGORIAS_DA_INCLUSAO,
  MAX_MOTIVO_INCLUSAO,
  MAX_PERMANENCIA_INCLUSAO_MIN,
  MIN_PERMANENCIA_INCLUSAO_MIN,
  pernasDaMudanca,
  posicoesParaIncluir,
  preverInclusao,
  preverLocalNovo,
  validarInclusao,
  validarLocalNovo,
  type AlvoDaMudanca,
  type DadosDaInclusao,
} from '../core/inclusao'
import {
  chegadaDaPrevia,
  criarPrevia,
  minutosDaPrevia,
  previaVencida,
  textoDaPrecisaoDoGps,
  textoDoErroDeGps,
  ehErroDeGps,
  type PreviaPorLocalizacao,
} from '../core/localizacao'
import { agora as relogio } from '../core/relogio'
import type { DadosPlano, Evento, Instante, Local, Trecho } from '../core/tipos'
import { mensagemDeErroDoBanco } from '../data/avisoBanco'
import { novoId, type Repositorio } from '../data/repositorio'
import { rotaDaPosicaoAtual } from '../servicos/localizacao'
import { calcularRota } from '../servicos/rotas'
import { CampoHora } from './componentes/CampoHora'
import { Hora } from './componentes/Hora'
import { Topo } from './componentes/Topo'
import { FormLocal } from './FormLocal'
import { formatarDuracao, horasEMinutosDe } from './logica/duracao'
import { resolverHorarioProximo } from './logica/horarioDigitado'
import { formatarHora } from './logica/horarios'
import { linkGoogleMaps } from './logica/linkMaps'
import {
  minutosDeOnibusDaRota,
  textoDoImpactoNoDestino,
  textoDoTrechoPelaLocalizacao,
  textoDoTrechoPelaRota,
  trechoDaPerna,
  type Perna,
} from './logica/mudancaDeRoteiro'
import { CATEGORIAS_DA_PARADA_INCLUIDA } from './logica/rotulos'
import { textoDoErroDeRota } from './logica/servicos'
import { nomeDaEtapaEmUso, textoDoAtraso } from './logica/textosViagem'
import { useOnline } from './useOnline'
import { useVoltarFecha } from './useVoltarFecha'

interface Props {
  repo: Repositorio
  plano: DadosPlano
  eventos: Evento[]
  agora: Instante
  alvo: AlvoDaMudanca
  /** Registrou: o chamador mostra o DESFAZER e recarrega. */
  onFeito: (eventos: Evento[], texto: string) => void
  onFechar: () => void
}

type Vista = 'formulario' | 'novo_local'

type Lado = 'ate' | 'de'
interface Situacao {
  lendo: boolean
  erro: string | null
}
const formatarFator = (f: number) => f.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const SEM_SITUACAO: Situacao = { lendo: false, erro: null }

/**
 * Um dos dois trechos novos. O tempo calculado aparece só como texto; os campos para digitar ficam
 * fechados e só abrem com "Usar outro tempo" (ou quando não há tempo calculado). Em cada momento a
 * tela diz qual tempo vale: o calculado ou o digitado.
 */
function BlocoDoTrecho({
  id, titulo, textoCalculado, detalhe, aviso, lendo, mensagem, manual, temCalculado, textoDoValor, vencida,
  onUsarOutro, onVoltar, onRecalcular, podeRecalcular, children,
}: {
  id: string
  titulo: string
  /** O tempo calculado, já em texto. Vazio se ainda não há. */
  textoCalculado: string | null
  detalhe?: string | null
  aviso?: string | null
  lendo: boolean
  /** Por que o trecho não foi calculado (falha ou impossibilidade). */
  mensagem: string | null
  manual: boolean
  temCalculado: boolean
  /** "20 min" etc., do tempo calculado que deixou de valer. */
  textoDoValor: string | null
  vencida: boolean
  onUsarOutro: () => void
  onVoltar: () => void
  onRecalcular: () => void
  podeRecalcular: boolean
  children: ReactNode
}) {
  return (
    <div className="campo" data-teste={id}>
      <span className="rotulo">{titulo}</span>
      {lendo && <p className="dica" role="status" data-teste={`${id}-lendo`}>Calculando…</p>}
      {!lendo && !manual && textoCalculado && (
        <>
          <p className="linha-grande" data-teste={`${id}-calculado`}>{textoCalculado}</p>
          {detalhe && <p className="dica">{detalhe}</p>}
        </>
      )}
      {!lendo && aviso && <p className="atencao-texto" role="alert" data-teste={`${id}-precisao`}>Atenção: {aviso}. O tempo pode estar errado.</p>}
      {!lendo && vencida && !manual && (
        <p className="atencao-texto" role="alert" data-teste={`${id}-vencida`}>Este tempo ficou antigo: a posição mudou. Calcule de novo.</p>
      )}
      {!lendo && mensagem && <p className="msg-erro" role="status" data-teste={`${id}-erro`}>{mensagem}</p>}
      {!lendo && manual && (
        <>
          <p className={temCalculado ? 'atencao-texto' : 'dica'} data-teste={`${id}-valendo`}>
            {temCalculado
              ? `Vale o tempo digitado, não o calculado${textoDoValor ? ` (${textoDoValor})` : ''}.`
              : 'Vale o tempo que você digitar.'}
          </p>
          {children}
        </>
      )}
      <div className="linha-campos">
        {!lendo && !manual && temCalculado && (
          <button type="button" className="botao pequeno" onClick={onUsarOutro} data-teste={`${id}-outro`}>Usar outro tempo</button>
        )}
        {!lendo && manual && temCalculado && (
          <button type="button" className="botao pequeno" onClick={onVoltar} data-teste={`${id}-voltar`}>Voltar ao calculado</button>
        )}
        {podeRecalcular && (
          <button type="button" className="botao pequeno" disabled={lendo} onClick={onRecalcular} data-teste={`${id}-recalcular`}>
            {lendo ? 'Calculando…' : 'Recalcular'}
          </button>
        )}
      </div>
    </div>
  )
}

function CamposDeHorasEMinutos({ id, valor, onMudar }: { id: string; valor: { horas: string; minutos: string }; onMudar: (v: { horas: string; minutos: string }) => void }) {
  return (
    <div className="linha-campos">
      <div className="campo">
        <label htmlFor={`${id}-h`}>Horas</label>
        <input id={`${id}-h`} inputMode="numeric" value={valor.horas} onChange={(e) => onMudar({ ...valor, horas: e.target.value })} autoComplete="off" />
      </div>
      <div className="campo">
        <label htmlFor={`${id}-m`}>Minutos</label>
        <input id={`${id}-m`} inputMode="numeric" value={valor.minutos} onChange={(e) => onMudar({ ...valor, minutos: e.target.value })} autoComplete="off" />
      </div>
    </div>
  )
}

export function MudancaDeRoteiro({ repo, plano: planoRecebido, eventos, agora, alvo, onFeito, onFechar }: Props) {
  const original = planoRecebido.viagem.planoOriginal!
  const online = useOnline()
  useVoltarFecha(true, onFechar)

  const [vista, setVista] = useState<Vista>('formulario')
  const [locais, setLocais] = useState<Local[]>(planoRecebido.locais)
  // O catálogo pode ganhar um local cadastrado aqui mesmo: o núcleo precisa enxergá-lo.
  const plano = useMemo(() => ({ ...planoRecebido, locais }), [planoRecebido, locais])
  const [localId, setLocalId] = useState('')
  const [etapaNovaId] = useState(() => novoId())
  const posicoes = useMemo(() => posicoesParaIncluir(plano, original, eventos, agora), [plano, original, eventos, agora])
  const [apos, setApos] = useState(alvo.tipo === 'incluir' ? (alvo.apos || posicoes[0] || '') : '')
  const [categoria, setCategoria] = useState('visita')
  const [motivo, setMotivo] = useState('')
  const [permanencia, setPermanencia] = useState('30')
  // Tempo calculado de cada trecho: pela rota (`Perna` do tipo rota) ou, no trecho em curso, pela localização.
  const [ateRota, setAteRota] = useState<Extract<Perna, { tipo: 'rota' }> | null>(null)
  const [deRota, setDeRota] = useState<Extract<Perna, { tipo: 'rota' }> | null>(null)
  const [previaLoc, setPreviaLoc] = useState<PreviaPorLocalizacao | null>(null)
  const [situacao, setSituacao] = useState<Record<Lado, Situacao>>({ ate: SEM_SITUACAO, de: SEM_SITUACAO })
  // "Usar outro tempo": o que vale é o digitado.
  const [outro, setOutro] = useState<Record<Lado, boolean>>({ ate: false, de: false })
  const [manualAte, setManualAte] = useState({ horas: '', minutos: '' })
  const [manualDe, setManualDe] = useState({ horas: '', minutos: '' })
  const [usarMaps, setUsarMaps] = useState(false)
  const [horaMaps, setHoraMaps] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const pedidos = useRef<Record<Lado, AbortController | null>>({ ate: null, de: null })
  const versao = useRef<Record<Lado, number>>({ ate: 0, de: 0 })
  useEffect(() => () => { pedidos.current.ate?.abort(); pedidos.current.de?.abort() }, [])

  /** Troca de local ou de posição: nada do que foi calculado vale mais. */
  function limpar() {
    for (const lado of ['ate', 'de'] as const) {
      pedidos.current[lado]?.abort()
      versao.current[lado]++
    }
    setAteRota(null)
    setDeRota(null)
    setPreviaLoc(null)
    setSituacao({ ate: SEM_SITUACAO, de: SEM_SITUACAO })
    setOutro({ ate: false, de: false })
    setManualAte({ horas: '', minutos: '' })
    setManualDe({ horas: '', minutos: '' })
    setUsarMaps(false)
    setHoraMaps('')
  }

  const incluir = alvo.tipo === 'incluir'
  const etapaDoLocalNovo = alvo.tipo === 'local_novo' ? plano.etapas.find((e) => e.id === alvo.etapaId) : undefined
  const alvoAtual: AlvoDaMudanca = incluir ? { tipo: 'incluir', apos } : alvo
  const etapaDeId = incluir ? etapaNovaId : alvo.etapaId
  const nome = (id: string) => nomeDaEtapaEmUso(plano.etapas.find((e) => e.id === id), plano.locais, eventos)
  const pernas = apos || !incluir ? pernasDaMudanca(plano, original, eventos, agora, alvoAtual) : null
  const emCurso = pernas?.ateOLocalEmCurso ?? false
  const localNovo = locais.find((l) => l.id === localId)
  const localAnterior = locais.find((l) => l.id === pernas?.anterior.localId)
  const localSeguinte = locais.find((l) => l.id === pernas?.seguinte.localId)
  const fator = plano.viagem.fatorOnibus

  const candidatosDaEtapa = new Set(etapaDoLocalNovo ? [etapaDoLocalNovo.localId, ...etapaDoLocalNovo.alternativas] : [])
  const opcoesDeLocal = locais.filter((l) => !candidatosDaEtapa.has(l.id)).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  // Os dois trechos novos: da etapa anterior até o local novo e dele até a etapa seguinte.
  const parAte = pernas && localId && pernas.anterior.localId
    ? { etapaOrigemId: pernas.anterior.etapaId, localOrigemId: pernas.anterior.localId, etapaDestinoId: etapaDeId, localDestinoId: localId }
    : null
  const parDe = pernas && localId && pernas.seguinte.localId
    ? { etapaOrigemId: etapaDeId, localOrigemId: localId, etapaDestinoId: pernas.seguinte.etapaId, localDestinoId: pernas.seguinte.localId }
    : null

  const nomeNovo = localNovo?.nome ?? 'o local novo'
  const titulo_ = (lado: Lado) =>
    lado === 'de'
      ? `De ${nomeNovo} até ${localSeguinte?.nome ?? 'a etapa seguinte'}`
      : emCurso ? `Até ${nomeNovo}` : `De ${localAnterior?.nome ?? 'a etapa anterior'} até ${nomeNovo}`
  const aoInformar = (lado: Lado) => (lado === 'ate' && emCurso ? 'Informe o horário do Google Maps.' : 'Digite o tempo.')

  /** Por que o trecho não pode ser calculado agora (sem coordenadas, sem internet); vazio se pode. */
  function impedimento(lado: Lado): string | null {
    if (!localNovo) return null
    const emTransito = lado === 'ate' && emCurso
    const origem = lado === 'de' ? localNovo : localAnterior
    const destino = lado === 'de' ? localSeguinte : localNovo
    // Em trânsito a origem é a posição do GPS: só o local novo precisa de coordenadas.
    const sem = (emTransito ? [destino] : [origem, destino]).find((l) => l && !l.coordenadas)
    const base = `${titulo_(lado)}: não foi calculado.`
    if (sem) return `${base} Sem coordenadas em ${sem.nome}. ${aoInformar(lado)}`
    if (!online) return `${base} Sem internet ou sinal fraco: a rota não está disponível. ${aoInformar(lado)}`
    return null
  }

  // Trecho até o local novo. Em trânsito vale a chegada (pela localização ou pelo Google Maps);
  // parado, o tempo do trecho (pela rota ou digitado).
  const pronto = { ate: emCurso ? previaLoc !== null : ateRota !== null, de: deRota !== null }
  const calculavel = (lado: Lado) =>
    !situacao[lado].erro && !impedimento(lado) && !!localNovo?.coordenadas &&
    (lado === 'de' ? !!localSeguinte?.coordenadas : emCurso || !!localAnterior?.coordenadas)
  // Os campos de digitar abrem quando a pessoa pede, ou quando não há tempo calculado nem está a caminho.
  const aberto = (lado: Lado) => outro[lado] || (!pronto[lado] && !situacao[lado].lendo && !calculavel(lado))
  const viaLocalizacao = emCurso && !aberto('ate')
  const viaMaps = (emCurso && aberto('ate')) || (!emCurso && usarMaps)
  const comMaps = emCurso || usarMaps
  const vencida = viaLocalizacao && previaLoc !== null && previaVencida(previaLoc, agora)
  const chegada = viaMaps ? resolverHorarioProximo(horaMaps, agora) : viaLocalizacao && previaLoc ? chegadaDaPrevia(previaLoc, fator, true) : null
  const perna = (lado: Lado): Perna | null => {
    const manual = lado === 'ate' ? manualAte : manualDe
    return aberto(lado) ? { tipo: 'manual', ...manual } : lado === 'ate' ? ateRota : deRota
  }
  const pernaAte = perna('ate')
  const pernaDe = perna('de')
  const trechoAte = parAte && !comMaps && pernaAte ? trechoDaPerna(parAte, pernaAte) : null
  const trechoDe = parDe && pernaDe ? trechoDaPerna(parDe, pernaDe) : null
  const trechos: Trecho[] = [trechoAte, trechoDe].filter((t): t is Trecho => t !== null)
  const origemDaChegada = viaLocalizacao && previaLoc ? ({ origem: 'localizacao', calculadoEm: previaLoc.calculadoEm } as const) : undefined
  const permanenciaMin = Number(permanencia)
  const motivoAparado = motivo.trim()

  const dadosDaParada: DadosDaInclusao = {
    apos,
    localId,
    categoria,
    permanenciaMin,
    ...(motivoAparado ? { motivo: motivoAparado } : {}),
    trechos,
  }
  const faltaPreencher =
    !localId || !pernas || !trechoDe || (comMaps ? chegada === null : !trechoAte) || (incluir && permanencia.trim() === '')
  const validacao = faltaPreencher || vencida
    ? null
    : incluir
      ? validarInclusao(plano, original, eventos, agora, etapaNovaId, dadosDaParada, chegada ?? undefined)
      : validarLocalNovo(plano, original, eventos, agora, alvo.etapaId, { localId, trechos }, chegada ?? undefined)
  const previa =
    validacao?.ok
      ? incluir
        ? preverInclusao(plano, original, eventos, agora, etapaNovaId, dadosDaParada, chegada ?? undefined)
        : preverLocalNovo(plano, original, eventos, agora, alvo.etapaId, { localId, trechos }, chegada ?? undefined)
      : null

  async function calcular(lado: Lado) {
    if (impedimento(lado) || !localNovo?.coordenadas) return
    const origem = lado === 'de' ? localNovo : localAnterior
    const destino = lado === 'de' ? localSeguinte : localNovo
    if (!destino?.coordenadas) return
    const emTransito = lado === 'ate' && emCurso
    if (!emTransito && !origem?.coordenadas) return
    pedidos.current[lado]?.abort()
    const controle = new AbortController()
    pedidos.current[lado] = controle
    const minha = ++versao.current[lado]
    setSituacao((x) => ({ ...x, [lado]: { lendo: true, erro: null } }))
    const falhou = (texto: string) => setSituacao((x) => ({ ...x, [lado]: { lendo: false, erro: `${titulo_(lado)}: não foi calculado. ${texto} ${aoInformar(lado)}` } }))
    try {
      if (emTransito) {
        const r = await rotaDaPosicaoAtual(destino.coordenadas, { sinal: controle.signal })
        if (minha !== versao.current[lado]) return
        if (!r.ok) {
          // O texto do GPS já manda informar o horário do Google Maps.
          const e = r.erro
          if (ehErroDeGps(e)) return setSituacao((x) => ({ ...x, [lado]: { lendo: false, erro: `${titulo_(lado)}: não foi calculado. ${textoDoErroDeGps(e)}` } }))
          return falhou(e === 'sem_rota' ? 'O serviço não achou rota da sua posição até lá.' : textoDoErroDeRota(e))
        }
        setPreviaLoc(criarPrevia(r.rota, r.posicao.precisaoM, relogio()))
        setOutro((x) => ({ ...x, ate: false }))
      } else {
        const r = await calcularRota(origem!.coordenadas!, destino.coordenadas, { sinal: controle.signal })
        if (minha !== versao.current[lado]) return
        if (!r.ok) return falhou(r.erro === 'sem_rota' ? 'Sem rota encontrada entre os dois locais.' : textoDoErroDeRota(r.erro))
        const nova = { tipo: 'rota' as const, minutosCarro: r.rota.minutosCarro, distanciaKm: r.rota.distanciaKm, calculadoEm: relogio() }
        if (lado === 'ate') setAteRota(nova)
        else setDeRota(nova)
        setOutro((x) => ({ ...x, [lado]: false }))
      }
      setSituacao((x) => ({ ...x, [lado]: SEM_SITUACAO }))
    } catch {
      // Cancelado: a tela foi fechada ou o local mudou.
    }
  }

  // Ao escolher o local (e ao voltar a internet), calcula sozinho o que ainda não tem tempo calculado.
  useEffect(() => {
    if (!localId || !pernas) return
    for (const lado of ['ate', 'de'] as const) {
      if (!pronto[lado] && !outro[lado] && !situacao[lado].lendo) void calcular(lado)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localId, apos, online, emCurso, !!pernas, localNovo?.coordenadas?.lat])

  /** Abre os campos já com o tempo calculado, em minutos de ônibus, para ajustar. */
  function usarOutroTempo(lado: Lado) {
    if (lado === 'ate' && emCurso) {
      if (chegada) setHoraMaps(formatarHora(chegada))
    } else {
      const calculada = lado === 'ate' ? ateRota : deRota
      if (calculada) (lado === 'ate' ? setManualAte : setManualDe)(horasEMinutosDe(minutosDeOnibusDaRota(calculada, fator)))
    }
    setOutro((x) => ({ ...x, [lado]: true }))
  }

  async function confirmar() {
    if (!validacao?.ok) return
    setOcupado(true)
    setErro(null)
    try {
      const r = incluir
        ? await repo.registrarInclusao(plano.viagem.id, etapaNovaId, dadosDaParada, chegada ?? undefined, origemDaChegada)
        : await repo.registrarLocalNovo(plano.viagem.id, alvo.etapaId, { localId, trechos }, chegada ?? undefined, origemDaChegada)
      if (!r.ok) return setErro(r.motivo)
      const nomeLocal = localNovo?.nome ?? 'local'
      onFeito(r.eventos, incluir ? `Parada incluída: ${nomeLocal}.` : `Local trocado para ${nomeLocal}.`)
    } catch (x) {
      setErro(mensagemDeErroDoBanco(x, 'Não foi possível registrar.'))
    } finally {
      setOcupado(false)
    }
  }

  if (vista === 'novo_local') {
    return (
      <FormLocal
        locaisDeReferencia={locais}
        onCancelar={() => setVista('formulario')}
        onSalvar={async (local) => {
          await repo.salvarLocal(local)
          setLocais(await repo.listarLocais())
          limpar()
          setLocalId(local.id)
          setVista('formulario')
        }}
      />
    )
  }

  const linkMaps = linkGoogleMaps(localNovo)
  const titulo = incluir ? 'Incluir parada' : 'Outro local'
  return (
    <>
      <Topo titulo={titulo} onVoltar={onFechar} rotuloVoltar="Voltar à viagem" />
      <main className="conteudo viagem" data-teste="mudanca-de-roteiro">
        <section className="cartao" aria-label="Local">
          {!incluir && (
            <p className="dica">
              Troca o local de <strong>{nome(alvo.etapaId)}</strong> por um local novo. O local de antes e as alternativas continuam
              disponíveis para voltar atrás. O plano original não muda.
            </p>
          )}
          {incluir && (
            <>
              <p className="dica">A parada nova entra no percurso. O plano original não muda e o atraso no destino continua medido contra ele.</p>
              <div className="campo">
                <label htmlFor="mr-apos">Depois de</label>
                <select
                  id="mr-apos"
                  value={apos}
                  onChange={(e) => { limpar(); setApos(e.target.value) }}
                >
                  {posicoes.map((id, i) => (
                    <option key={id} value={id}>
                      {nome(id)}{i === 0 ? ' (posição atual)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
          <div className="campo">
            <label htmlFor="mr-local">Local</label>
            <select id="mr-local" value={localId} onChange={(e) => { limpar(); setLocalId(e.target.value) }}>
              <option value="">Escolha um local do catálogo</option>
              {opcoesDeLocal.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome} · {l.cidade}
                </option>
              ))}
            </select>
            <button type="button" className="botao" onClick={() => setVista('novo_local')}>
              Cadastrar novo local
            </button>
            <p className="dica">Cadastre com a busca de endereço ou colando as coordenadas do Google Maps.</p>
          </div>
          {incluir && (
            <>
              <div className="campo">
                <label htmlFor="mr-categoria">Categoria</label>
                <select id="mr-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                  {CATEGORIAS_DA_PARADA_INCLUIDA.filter((c) => (CATEGORIAS_DA_INCLUSAO as readonly string[]).includes(c.valor)).map((c) => (
                    <option key={c.valor} value={c.valor}>{c.rotulo}</option>
                  ))}
                </select>
              </div>
              <div className="campo">
                <label htmlFor="mr-motivo">Motivo (opcional)</label>
                <input id="mr-motivo" value={motivo} maxLength={MAX_MOTIVO_INCLUSAO} onChange={(e) => setMotivo(e.target.value)} autoComplete="off" />
                <p className="dica">Sem nomes de passageiros.</p>
              </div>
              <div className="campo">
                <label htmlFor="mr-permanencia">Tempo de permanência (min)</label>
                <input
                  id="mr-permanencia"
                  type="number"
                  inputMode="numeric"
                  min={MIN_PERMANENCIA_INCLUSAO_MIN}
                  max={MAX_PERMANENCIA_INCLUSAO_MIN}
                  value={permanencia}
                  onChange={(e) => setPermanencia(e.target.value)}
                />
              </div>
            </>
          )}
        </section>

        {localId && pernas && (
          <section className="cartao" aria-label="Tempos">
            <h2>Tempos</h2>
            <p className="dica">Nada é estimado: sem o tempo, a mudança não é registrada.</p>

            {!emCurso && usarMaps ? (
              <div className="campo" data-teste="mr-ate">
                <span className="rotulo">{titulo_('ate')}</span>
                <p className="dica">{`Chegada em ${nomeNovo} pelo Google Maps, no lugar do tempo do trecho. Vale o horário que você digitar.`}</p>
                {linkMaps && (
                  <a className="botao largo link-botao" href={linkMaps} target="_blank" rel="noopener noreferrer">
                    ABRIR NO GOOGLE MAPS
                  </a>
                )}
                <CampoHora id="mr-chegada" rotulo="Chegada informada pelo Google Maps" valor={horaMaps} onMudar={setHoraMaps} resolvido={chegada} agora={agora} />
                <button type="button" className="botao pequeno" onClick={() => setUsarMaps(false)}>
                  Prefiro informar o tempo do trecho
                </button>
              </div>
            ) : (
              <BlocoDoTrecho
                id="mr-ate"
                titulo={titulo_('ate')}
                textoCalculado={
                  emCurso
                    ? previaLoc && textoDoTrechoPelaLocalizacao(titulo_('ate'), minutosDaPrevia(previaLoc, fator, true), previaLoc.calculadoEm)
                    : ateRota && textoDoTrechoPelaRota(titulo_('ate'), ateRota, fator)
                }
                detalhe={
                  emCurso && previaLoc
                    ? `Da sua posição: carro ${formatarDuracao(previaLoc.minutosCarro)} × fator ${formatarFator(fator)} · ${previaLoc.distanciaKm.toLocaleString('pt-BR')} km`
                    : ateRota && `${ateRota.distanciaKm.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km · estimativa sem trânsito`
                }
                aviso={emCurso && previaLoc ? textoDaPrecisaoDoGps(previaLoc.precisaoRuimM) : null}
                lendo={situacao.ate.lendo}
                mensagem={situacao.ate.erro ?? (pronto.ate ? null : impedimento('ate'))}
                manual={aberto('ate')}
                temCalculado={pronto.ate}
                textoDoValor={
                  emCurso
                    ? previaLoc ? formatarDuracao(minutosDaPrevia(previaLoc, fator, true)) : null
                    : ateRota ? formatarDuracao(minutosDeOnibusDaRota(ateRota, fator)) : null
                }
                vencida={vencida}
                onUsarOutro={() => usarOutroTempo('ate')}
                onVoltar={() => setOutro((x) => ({ ...x, ate: false }))}
                onRecalcular={() => void calcular('ate')}
                podeRecalcular={!!localNovo?.coordenadas && online}
              >
                {emCurso ? (
                  <>
                    <p className="dica">
                      {`Em trânsito, o trecho até ${nomeNovo} está em curso: informe a chegada pelo Google Maps.`}
                    </p>
                    {linkMaps && (
                      <a className="botao largo link-botao" href={linkMaps} target="_blank" rel="noopener noreferrer">
                        ABRIR NO GOOGLE MAPS
                      </a>
                    )}
                    <CampoHora id="mr-chegada" rotulo="Chegada informada pelo Google Maps" valor={horaMaps} onMudar={setHoraMaps} resolvido={chegada} agora={agora} />
                  </>
                ) : (
                  <>
                    <CamposDeHorasEMinutos id="mr-ate" valor={manualAte} onMudar={setManualAte} />
                    <button type="button" className="botao pequeno" onClick={() => setUsarMaps(true)}>
                      Prefiro informar a chegada pelo Google Maps
                    </button>
                  </>
                )}
              </BlocoDoTrecho>
            )}

            <BlocoDoTrecho
              id="mr-de"
              titulo={titulo_('de')}
              textoCalculado={deRota && textoDoTrechoPelaRota(titulo_('de'), deRota, fator)}
              detalhe={deRota && `${deRota.distanciaKm.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km · estimativa sem trânsito`}
              lendo={situacao.de.lendo}
              mensagem={situacao.de.erro ?? (pronto.de ? null : impedimento('de'))}
              manual={aberto('de')}
              temCalculado={pronto.de}
              textoDoValor={deRota ? formatarDuracao(minutosDeOnibusDaRota(deRota, fator)) : null}
              vencida={false}
              onUsarOutro={() => usarOutroTempo('de')}
              onVoltar={() => setOutro((x) => ({ ...x, de: false }))}
              onRecalcular={() => void calcular('de')}
              podeRecalcular={!!(localNovo?.coordenadas && localSeguinte?.coordenadas) && online}
            >
              <CamposDeHorasEMinutos id="mr-de" valor={manualDe} onMudar={setManualDe} />
            </BlocoDoTrecho>
            <p className="dica">
              Rota: serviço gratuito do OpenStreetMap, sem trânsito. Só as coordenadas vão ao serviço, agora; a sua posição não é guardada.
            </p>
            {incluir && (plano.etapas.find((e) => e.id === pernas.seguinte.etapaId)?.alternativas.length ?? 0) > 0 && (
              <p className="dica">
                As alternativas de {nome(pernas.seguinte.etapaId)} ficam sem tempo até informar o tempo de {localNovo?.nome ?? 'a parada nova'} até elas.
              </p>
            )}
          </section>
        )}

        {previa && (
          <section className="cartao" aria-label="Previsão" data-teste="mudanca-previa">
            <h2>O que muda</h2>
            {previa.chegadaNaParada && (
              <p>
                Chegada em {localNovo?.nome}: <Hora instante={previa.chegadaNaParada} agora={agora} />
              </p>
            )}
            {previa.chegadaDestino && (
              <p>
                Destino: <Hora instante={previa.chegadaDestino} agora={agora} />
                {previa.atrasoDestinoMin !== null && <> ({textoDoAtraso(previa.atrasoDestinoMin)})</>} ·{' '}
                {textoDoImpactoNoDestino(previa.impactoDestinoMin)}
              </p>
            )}
            {previa.chegadaNaParada && <p className="dica">Previsão calculada agora, às {formatarHora(agora)}.</p>}
          </section>
        )}

        {validacao && !validacao.ok && <p className="msg-erro" role="alert" data-teste="mudanca-recusa">{validacao.motivo}</p>}
        {erro && <p className="msg-erro" role="alert">{erro}</p>}
        <div className="acoes">
          {vencida ? (
            <button type="button" className="botao principal" disabled={ocupado || situacao.ate.lendo} onClick={() => void calcular('ate')} data-teste="mr-recalcular-revisar">
              Recalcular e revisar
            </button>
          ) : (
            <button type="button" className="botao principal" disabled={!validacao?.ok || ocupado} onClick={() => void confirmar()}>
              {incluir ? 'INCLUIR PARADA' : 'TROCAR PARA ESTE LOCAL'}
            </button>
          )}
          <button type="button" className="botao" onClick={onFechar}>
            Cancelar
          </button>
        </div>
      </main>
    </>
  )
}
