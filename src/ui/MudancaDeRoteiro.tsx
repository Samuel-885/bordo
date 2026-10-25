// Mudança de roteiro em viagem: incluir uma parada nova ou trocar o local de uma parada flexível
// por um local novo. Tela cheia, aberta por cima da viagem. O núcleo (`core/inclusao.ts`) valida e
// calcula a prévia; aqui só há o formulário. Nada é estimado: sem tempo, não inclui.

import { useEffect, useMemo, useRef, useState } from 'react'
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
import type { DadosPlano, Evento, Instante, Local, Trecho } from '../core/tipos'
import { mensagemDeErroDoBanco } from '../data/avisoBanco'
import { novoId, type Repositorio } from '../data/repositorio'
import { calcularRota } from '../servicos/rotas'
import { CampoHora } from './componentes/CampoHora'
import { Hora } from './componentes/Hora'
import { Topo } from './componentes/Topo'
import { FormLocal } from './FormLocal'
import { resolverHorarioProximo } from './logica/horarioDigitado'
import { formatarHora } from './logica/horarios'
import { linkGoogleMaps } from './logica/linkMaps'
import {
  pernaVazia,
  textoDaRotaDaPerna,
  textoDoImpactoNoDestino,
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

function CampoDeTempo({
  id, titulo, perna, onMudar, podeCalcular, motivoSemRota, calculando, aoCalcular, fator,
}: {
  id: string
  titulo: string
  perna: Perna
  onMudar: (p: Perna) => void
  podeCalcular: boolean
  motivoSemRota: string | null
  calculando: boolean
  aoCalcular: () => void
  fator: number
}) {
  return (
    <div className="campo" data-teste={id}>
      <span className="rotulo">{titulo}</span>
      <div className="linha-campos">
        <div className="campo">
          <label htmlFor={`${id}-h`}>Horas</label>
          <input
            id={`${id}-h`}
            inputMode="numeric"
            value={perna.tipo === 'manual' ? perna.horas : ''}
            onChange={(e) => onMudar({ tipo: 'manual', horas: e.target.value, minutos: perna.tipo === 'manual' ? perna.minutos : '' })}
            autoComplete="off"
          />
        </div>
        <div className="campo">
          <label htmlFor={`${id}-m`}>Minutos</label>
          <input
            id={`${id}-m`}
            inputMode="numeric"
            value={perna.tipo === 'manual' ? perna.minutos : ''}
            onChange={(e) => onMudar({ tipo: 'manual', horas: perna.tipo === 'manual' ? perna.horas : '', minutos: e.target.value })}
            autoComplete="off"
          />
        </div>
      </div>
      <button type="button" className="botao pequeno" disabled={!podeCalcular || calculando} onClick={aoCalcular}>
        {calculando ? 'Calculando…' : 'Calcular pela rota'}
      </button>
      {motivoSemRota && <p className="dica">{motivoSemRota}</p>}
      {perna.tipo === 'rota' && (
        <p className="dica" role="status" data-teste={`${id}-rota`}>
          Pela rota: {textoDaRotaDaPerna(perna, fator)}. Digite um tempo para usar o seu.
        </p>
      )}
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
  const [ate, setAte] = useState<Perna>(pernaVazia())
  const [de, setDe] = useState<Perna>(pernaVazia())
  const [usarMaps, setUsarMaps] = useState(false)
  const [horaMaps, setHoraMaps] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [calculando, setCalculando] = useState<'ate' | 'de' | null>(null)
  const [avisoDeRota, setAvisoDeRota] = useState<string | null>(null)
  const pedido = useRef<AbortController | null>(null)
  useEffect(() => () => pedido.current?.abort(), [])

  const incluir = alvo.tipo === 'incluir'
  const etapaDoLocalNovo = alvo.tipo === 'local_novo' ? plano.etapas.find((e) => e.id === alvo.etapaId) : undefined
  const alvoAtual: AlvoDaMudanca = incluir ? { tipo: 'incluir', apos } : alvo
  const etapaDeId = incluir ? etapaNovaId : alvo.etapaId
  const nome = (id: string) => nomeDaEtapaEmUso(plano.etapas.find((e) => e.id === id), plano.locais, eventos)
  const pernas = apos || !incluir ? pernasDaMudanca(plano, original, eventos, agora, alvoAtual) : null
  const emCurso = pernas?.ateOLocalEmCurso ?? false
  const mapsObrigatorio = emCurso
  const comMaps = mapsObrigatorio || usarMaps
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
  const trechoAte = parAte && !comMaps ? trechoDaPerna(parAte, ate) : null
  const trechoDe = parDe ? trechoDaPerna(parDe, de) : null
  const trechos: Trecho[] = [trechoAte, trechoDe].filter((t): t is Trecho => t !== null)
  const chegada = comMaps ? resolverHorarioProximo(horaMaps, agora) : null
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
  const validacao = faltaPreencher
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

  async function calcular(perna: 'ate' | 'de') {
    const origem = perna === 'ate' ? localAnterior : localNovo
    const destino = perna === 'ate' ? localNovo : localSeguinte
    const par = perna === 'ate' ? parAte : parDe
    if (!origem?.coordenadas || !destino?.coordenadas || !par) return
    pedido.current?.abort()
    const controle = new AbortController()
    pedido.current = controle
    setAvisoDeRota(null)
    setCalculando(perna)
    try {
      const r = await calcularRota(origem.coordenadas, destino.coordenadas, { sinal: controle.signal })
      if (controle.signal.aborted) return
      if (!r.ok) return setAvisoDeRota(r.erro === 'sem_rota' ? 'Sem rota encontrada entre os dois locais. Digite o tempo.' : `${textoDoErroDeRota(r.erro)} Digite o tempo.`)
      const nova: Perna = { tipo: 'rota', minutosCarro: r.rota.minutosCarro, distanciaKm: r.rota.distanciaKm, calculadoEm: agora }
      if (perna === 'ate') setAte(nova)
      else setDe(nova)
    } catch {
      // Cancelado: a tela foi fechada.
    } finally {
      if (pedido.current === controle) setCalculando(null)
    }
  }

  const motivoSemRota = (a: Local | undefined, b: Local | undefined): string | null => {
    if (!a || !b) return null
    if (!a.coordenadas || !b.coordenadas) return `Sem coordenadas em ${!a.coordenadas ? a.nome : b.nome}: sem rota. Digite o tempo.`
    if (!online) return 'Sem internet: a rota não está disponível. Digite o tempo.'
    return null
  }

  async function confirmar() {
    if (!validacao?.ok) return
    setOcupado(true)
    setErro(null)
    try {
      const r = incluir
        ? await repo.registrarInclusao(plano.viagem.id, etapaNovaId, dadosDaParada, chegada ?? undefined)
        : await repo.registrarLocalNovo(plano.viagem.id, alvo.etapaId, { localId, trechos }, chegada ?? undefined)
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
          setLocalId(local.id)
          setAte(pernaVazia())
          setDe(pernaVazia())
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
                  onChange={(e) => { setApos(e.target.value); setAte(pernaVazia()); setDe(pernaVazia()) }}
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
            <select id="mr-local" value={localId} onChange={(e) => { setLocalId(e.target.value); setAte(pernaVazia()); setDe(pernaVazia()) }}>
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

            {comMaps ? (
              <div className="campo">
                <p className="dica">
                  {mapsObrigatorio
                    ? `Em trânsito, o trecho até ${localNovo?.nome ?? 'o local novo'} está em curso: informe a chegada pelo Google Maps.`
                    : `Chegada em ${localNovo?.nome ?? 'o local novo'} pelo Google Maps, no lugar do tempo do trecho.`}
                </p>
                {linkMaps && (
                  <a className="botao largo link-botao" href={linkMaps} target="_blank" rel="noopener noreferrer">
                    ABRIR NO GOOGLE MAPS
                  </a>
                )}
                <CampoHora id="mr-chegada" rotulo="Chegada informada pelo Google Maps" valor={horaMaps} onMudar={setHoraMaps} resolvido={chegada} agora={agora} />
                {!mapsObrigatorio && (
                  <button type="button" className="botao pequeno" onClick={() => setUsarMaps(false)}>
                    Prefiro informar o tempo do trecho
                  </button>
                )}
              </div>
            ) : (
              <>
                <CampoDeTempo
                  id="mr-ate"
                  titulo={`De ${localAnterior?.nome ?? 'a etapa anterior'} até ${localNovo?.nome ?? 'o local novo'}`}
                  perna={ate}
                  onMudar={setAte}
                  podeCalcular={!!(localAnterior?.coordenadas && localNovo?.coordenadas) && online}
                  motivoSemRota={motivoSemRota(localAnterior, localNovo)}
                  calculando={calculando === 'ate'}
                  aoCalcular={() => void calcular('ate')}
                  fator={fator}
                />
                <button type="button" className="botao pequeno" onClick={() => setUsarMaps(true)}>
                  Prefiro informar a chegada pelo Google Maps
                </button>
              </>
            )}

            <CampoDeTempo
              id="mr-de"
              titulo={`De ${localNovo?.nome ?? 'o local novo'} até ${localSeguinte?.nome ?? 'a etapa seguinte'}`}
              perna={de}
              onMudar={setDe}
              podeCalcular={!!(localNovo?.coordenadas && localSeguinte?.coordenadas) && online}
              motivoSemRota={motivoSemRota(localNovo, localSeguinte)}
              calculando={calculando === 'de'}
              aoCalcular={() => void calcular('de')}
              fator={fator}
            />
            {avisoDeRota && <p className="msg-erro" role="status">{avisoDeRota}</p>}
            <p className="dica">Rota: serviço gratuito do OpenStreetMap, só com as coordenadas dos dois locais. É opcional: nada depende dela.</p>
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
          <button type="button" className="botao principal" disabled={!validacao?.ok || ocupado} onClick={() => void confirmar()}>
            {incluir ? 'INCLUIR PARADA' : 'TROCAR PARA ESTE LOCAL'}
          </button>
          <button type="button" className="botao" onClick={onFechar}>
            Cancelar
          </button>
        </div>
      </main>
    </>
  )
}
