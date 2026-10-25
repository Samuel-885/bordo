// "Atualizar pela minha localização": lê o GPS uma vez (ao abrir, que é o toque), calcula o tempo
// até a próxima parada pelo OSRM (sem trânsito) e mostra a prévia. Só grava ao confirmar.
// A posição fica só na memória desta folha; nada dela é guardado. Nenhuma regra aqui: a conta e
// os textos de erro vêm do núcleo.

import { useEffect, useRef, useState } from 'react'
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
import type { Ponto } from '../core/rotas'
import type { Instante } from '../core/tipos'
import { agora as relogio } from '../core/relogio'
import { rotaDaPosicaoAtual } from '../servicos/localizacao'
import { Folha } from './componentes/Folha'
import { formatarDuracao } from './logica/duracao'
import { formatarHora } from './logica/horarios'
import { textoDoErroDeRota } from './logica/servicos'

type Estado =
  | { fase: 'lendo' }
  | { fase: 'erro'; texto: string }
  | { fase: 'previa'; previa: PreviaPorLocalizacao }

export interface DadosDaLocalizacao {
  horario: Instante
  calculadoEm: Instante
}

interface Props {
  ocupado: boolean
  erro: string | null
  agora: Instante
  nomeEtapa: string
  destino: Ponto
  fator: number
  onConfirmar: (dados: DadosDaLocalizacao) => void
  onCancelar: () => void
  /** Volta para a folha de digitar o horário do Google Maps. */
  onDigitar: () => void
}

const formatarFator = (f: number) => f.toLocaleString('pt-BR', { minimumFractionDigits: 2 })

export function FolhaLocalizacao({ ocupado, erro, agora, nomeEtapa, destino, fator, onConfirmar, onCancelar, onDigitar }: Props) {
  const [estado, setEstado] = useState<Estado>({ fase: 'lendo' })
  const [aplicarFator, setAplicarFator] = useState(true)
  const tentativa = useRef(0)
  const iniciou = useRef(false)

  async function ler() {
    const minha = ++tentativa.current
    setEstado({ fase: 'lendo' })
    const r = await rotaDaPosicaoAtual(destino)
    if (minha !== tentativa.current) return
    if (r.ok) {
      // O horário do cálculo é o do relógio do app no momento em que a resposta chegou.
      setEstado({ fase: 'previa', previa: criarPrevia(r.rota, r.posicao.precisaoM, relogio()) })
    } else if (r.erro === 'sem_rota') {
      setEstado({ fase: 'erro', texto: 'O serviço não achou rota da sua posição até lá. Digite o horário do Google Maps.' })
    } else if (ehErroDeGps(r.erro)) {
      setEstado({ fase: 'erro', texto: textoDoErroDeGps(r.erro) })
    } else {
      setEstado({ fase: 'erro', texto: `${textoDoErroDeRota(r.erro)} Digite o horário do Google Maps.` })
    }
  }

  useEffect(() => {
    if (iniciou.current) return
    iniciou.current = true
    void ler()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const previa = estado.fase === 'previa' ? estado.previa : null
  const vencida = previa ? previaVencida(previa, agora) : false
  const horario = previa ? chegadaDaPrevia(previa, fator, aplicarFator) : null
  const aviso = previa ? textoDaPrecisaoDoGps(previa.precisaoRuimM) : null

  return (
    <Folha
      aberta
      titulo="Atualizar pela minha localização"
      rotuloConfirmar="Atualizar previsão"
      ocupado={ocupado}
      erro={erro}
      podeConfirmar={previa !== null && !vencida}
      onCancelar={onCancelar}
      onConfirmar={() => previa && horario && onConfirmar({ horario, calculadoEm: previa.calculadoEm })}
    >
      {estado.fase === 'lendo' && <p className="dica" role="status" data-teste="loc-lendo">Lendo sua posição e calculando a rota…</p>}

      {estado.fase === 'erro' && (
        <>
          <p className="msg-erro" role="alert" data-teste="loc-erro">{estado.texto}</p>
          <button type="button" className="botao largo" onClick={() => void ler()}>Tentar de novo</button>
          <button type="button" className="botao largo" onClick={onDigitar}>Digitar o horário do Google Maps</button>
        </>
      )}

      {previa && horario && (
        <div data-teste="loc-previa">
          <p className="linha-grande">
            Chegada em {nomeEtapa} às <span className="hora">{formatarHora(horario)}</span>
          </p>
          <p className="dica">sem trânsito · calculado às {formatarHora(previa.calculadoEm)}</p>
          <p className="dica">
            Da sua posição: carro {formatarDuracao(previa.minutosCarro)}
            {aplicarFator ? ` × fator ${formatarFator(fator)} = ${formatarDuracao(minutosDaPrevia(previa, fator, true))}` : ''} · {previa.distanciaKm.toLocaleString('pt-BR')} km
          </p>
          {aviso && <p className="atencao-texto" role="alert" data-teste="loc-precisao">Atenção: {aviso}. O tempo pode estar errado.</p>}
          <label className="opcao">
            <input type="checkbox" checked={aplicarFator} onChange={(e) => setAplicarFator(e.target.checked)} />
            <span>Aplicar fator ônibus (× {formatarFator(fator)})</span>
          </label>
          {vencida && (
            <p className="atencao-texto" role="alert" data-teste="loc-vencida">
              Esta previsão ficou antiga: a posição mudou. Calcule de novo.
            </p>
          )}
          <button type="button" className="botao largo" onClick={() => void ler()}>Ler a posição de novo</button>
          <button type="button" className="botao largo" onClick={onDigitar}>Digitar o horário do Google Maps</button>
        </div>
      )}
      <p className="dica">Só as coordenadas vão ao serviço de rotas (OpenStreetMap), agora; a posição não é guardada.</p>
    </Folha>
  )
}
