// Textos das falhas dos serviços da fase 8 (rotas e busca de endereço) e o resultado da busca no formulário.

import { CONFIG } from '../../core/config'
import type { ErroDeGps } from '../../core/localizacao'
import type { ErroDeServico, ResultadoDeBusca } from '../../core/rotas'
import { formatarCoordenadas } from './coordenadas'
import type { FormLocal } from './formLocal'

export function textoDoErroDeBusca(erro: ErroDeServico): string {
  switch (erro) {
    case 'sem_internet':
      return 'Sem internet ou sinal fraco: a busca de endereço precisa de conexão. O resto do formulário funciona; você pode colar as coordenadas.'
    case 'tempo_esgotado':
      return 'O serviço de busca demorou demais para responder. Tente de novo.'
    case 'limite':
      return 'O serviço de busca recebeu pedidos demais. Espere um pouco e tente de novo.'
    case 'fora':
      return 'O serviço de busca está fora do ar agora. Tente mais tarde ou cole as coordenadas.'
  }
}

export function textoDoErroDeRota(erro: ErroDeServico | 'cancelado'): string {
  switch (erro) {
    case 'sem_internet':
      return 'Sem internet ou sinal fraco: o cálculo de rotas precisa de conexão.'
    case 'tempo_esgotado':
      return 'O serviço de rotas demorou demais para responder.'
    case 'limite':
      return 'O serviço de rotas atingiu o limite de uso.'
    case 'fora':
      return 'O serviço de rotas está fora do ar agora.'
    case 'cancelado':
      return 'Cálculo cancelado.'
  }
}

/** "Cidade, Estado" de um resultado da busca (parte que faltar é omitida). */
export function localizacaoDoResultado(r: ResultadoDeBusca): string {
  return [r.cidade, r.estado].filter(Boolean).join(', ')
}

/** "Estabelecimento · exato" ou "Rua · aproximado": o que o ponto representa e se é o lugar mesmo. */
export function textoDaPrecisao(r: ResultadoDeBusca): string {
  return `${r.tipoDoLugar} · ${r.precisao === 'exata' ? 'exato' : 'aproximado'}`
}

/** Dica ao escolher um resultado aproximado; vazio no exato. */
export function dicaDePrecisao(r: ResultadoDeBusca): string | null {
  if (r.precisao === 'exata') return null
  return `Resultado aproximado (${r.tipoDoLugar.toLowerCase()}): o ponto não é o lugar exato. Para ter precisão, ajuste o pino no mapa ou cole as coordenadas do Google Maps no campo abaixo.`
}

/**
 * O formulário depois de escolher um resultado: coordenadas e cidade preenchidas (a cidade só se o
 * serviço trouxe uma). Os dois continuam editáveis, e nome, horários e o resto não mudam.
 */
export function formularioComResultado(f: FormLocal, r: ResultadoDeBusca): FormLocal {
  return { ...f, coordenadas: formatarCoordenadas({ lat: r.lat, lng: r.lng }), cidade: r.cidade || f.cidade }
}

/** Falhas do botão "Usar minha localização" do mapa do local. O GPS não precisa de internet, só o mapa. */
export function textoDoErroDeGpsNoLocal(erro: ErroDeGps): string {
  switch (erro) {
    case 'negada':
      return 'Sem permissão para usar a localização. Libere a localização deste site nas configurações do navegador, ou toque no mapa para marcar o ponto.'
    case 'sem_sinal':
      return 'Sem sinal de GPS agora. Tente de novo em um lugar mais aberto, ou toque no mapa para marcar o ponto.'
    case 'gps_tempo_esgotado':
      return 'O GPS demorou demais para responder. Tente de novo, ou toque no mapa para marcar o ponto.'
    case 'sem_suporte':
      return 'Este aparelho ou navegador não oferece localização. Toque no mapa para marcar o ponto.'
  }
}

/** Aviso (sem bloquear) quando o raio de incerteza do GPS passa de `CONFIG.gpsPrecisaoLocalM`. */
export function avisoDePrecisaoDoGps(precisaoM: number): string | null {
  if (precisaoM <= CONFIG.gpsPrecisaoLocalM) return null
  return `Precisão do GPS de cerca de ${Math.round(precisaoM)} m: o pino pode estar longe do ponto exato. Arraste o pino para ajustar.`
}
