// Operações de leitura e escrita do planejamento. Um repositório pertence a um
// espaço (real ou demonstração) e se recusa a trabalhar se o relógio não for o do
// espaço: nunca pode existir banco real com relógio simulado.

import { corrigirHorario, criarEvento, type ConteudoEvento } from '../core/eventos'
import {
  etapasAposExcluir,
  etapasAposSalvar,
  moverEtapa,
  normalizarOrdem,
  trechosQueDeixamDeValer,
} from '../core/ordem'
import { calcularEstado, calcularPlanoOriginal, pendenciasDeRegistro, type BloqueioInicio } from '../core/previsao'
import { chegadaDaConsulta, validarConsulta, vigenciaDaConsulta } from '../core/consulta'
import { validarTrechoManualEmViagem, validarTrocaComChegada } from '../core/viabilidade'
import { aplicarRota, manterManual, trechoManualComRota, usarRotaNoLugarDoManual, validarFatorOnibus, type RotaCalculada } from '../core/rotas'
import { paradaAberta, validarCorrecao, validarCorrecaoDaObservacao, validarHorario, validarRegistro } from '../core/registro'
import { agora, simuladoAtivo } from '../core/relogio'
import { diferencaMin, naHoraDoDia, somarMinutos, truncarMinuto } from '../core/tempo'
import { eventosDaConferencia, type ContextoConferencia, type DecisaoDePendente, type EstadoConferencia } from '../core/conferencia'
import { validarCadastro, validarExclusao, type DadosPassageiro } from '../core/passageiros'
import { validarModelo, type IdModelo } from '../core/modelos'
import { montarBackup, resumirViagens, type Backup, type ConteudoBackup, type ResumoViagem } from '../core/backup'
import type { Consulta, DadosPlano, Etapa, Evento, Instante, Local, Passageiro, RestauradoDe, Trecho, UltimoBackup, Viagem } from '../core/tipos'
import type { BancoBordo, Espaco } from './banco'

export type ResultadoInicio =
  | { ok: true; viagem: Viagem }
  | { ok: false; motivo: 'nao_planejando' | 'viagem_inexistente' }
  | { ok: false; motivo: 'bloqueios'; bloqueios: BloqueioInicio[] }

export type ResultadoRegistro =
  | { ok: true; /** Eventos criados, na ordem; é o que se passa a `desfazerRegistro`. */ eventos: Evento[]; viagem: Viagem }
  | { ok: false; motivo: string }

export interface OpcoesRegistro {
  /** Horário do fato, quando não é agora (imprevisto, VOLTAMOS). */
  horarioFato?: Instante
  observacao?: string
}

export class ErroDeEspaco extends Error {}
export class EdicaoBloqueada extends Error {}
export class LocalEmUso extends Error {}

/** Como restaurar um backup: só as viagens escolhidas (as demais ficam) ou tudo (o celular vira o arquivo). */
export type OpcoesDeRestauracao = { modo: 'juntar'; viagemIds: readonly string[] } | { modo: 'substituir_tudo' }

export type ResultadoRestauracao = { ok: true; viagemIds: string[] } | { ok: false; motivo: string }

export function novoId(): string {
  return crypto.randomUUID()
}

/** Equipe: inteiro de 0 a 99. Vazio ou inválido vale 0. */
export function equipeValida(equipe: number | undefined): number {
  return equipe !== undefined && Number.isInteger(equipe) && equipe > 0 ? Math.min(equipe, 99) : 0
}

const chaveTrecho = (t: Pick<Trecho, 'etapaOrigemId' | 'localOrigemId' | 'etapaDestinoId' | 'localDestinoId'>) =>
  [t.etapaOrigemId, t.localOrigemId, t.etapaDestinoId, t.localDestinoId] as [string, string, string, string]

export class Repositorio {
  readonly espaco: Espaco
  readonly #db: BancoBordo

  constructor(db: BancoBordo, espaco: Espaco) {
    this.#db = db
    this.espaco = espaco
  }

  /** O espaço real só roda com o relógio real; a demonstração, só com o simulado. */
  #exigirRelogioDoEspaco(): void {
    if (this.espaco === 'real' && simuladoAtivo()) {
      throw new ErroDeEspaco('O banco real não pode ser usado com o relógio simulado ligado.')
    }
    if (this.espaco === 'demo' && !simuladoAtivo()) {
      throw new ErroDeEspaco('O banco da demonstração só pode ser usado com o relógio simulado ligado.')
    }
  }

  // ---------- Viagens ----------

  async listarViagens(): Promise<Viagem[]> {
    this.#exigirRelogioDoEspaco()
    return this.#db.viagens.toArray()
  }

  async obterViagem(id: string): Promise<Viagem | undefined> {
    this.#exigirRelogioDoEspaco()
    return this.#db.viagens.get(id)
  }

  /**
   * Cria ou atualiza os dados da viagem. Depois de iniciada, só o nome, a identificação e a
   * equipe podem mudar (a equipe não muda em viagem concluída).
   * Mudar a data de saída desloca junto os horários já gravados das etapas.
   */
  async salvarViagem(viagem: Viagem): Promise<void> {
    this.#exigirRelogioDoEspaco()
    const { viagens, etapas } = this.#db
    await this.#db.transaction('rw', viagens, etapas, async () => {
      const atual = await viagens.get(viagem.id)
      if (atual && atual.status !== 'planejando') {
        // Plano original e status nunca são alterados por aqui.
        const mudancas: Partial<Viagem> = { nome: viagem.nome }
        if (viagem.identificacao?.trim()) mudancas.identificacao = viagem.identificacao.trim()
        else delete atual.identificacao
        if (atual.status === 'em_andamento') {
          const equipe = equipeValida(viagem.equipe)
          if (equipe) mudancas.equipe = equipe
          else delete atual.equipe
        }
        await viagens.put({ ...atual, ...mudancas })
        return
      }
      if (atual) {
        const dias = Math.round(
          diferencaMin(naHoraDoDia(viagem.dataSaida, '00:00'), naHoraDoDia(atual.dataSaida, '00:00')) / (24 * 60),
        )
        if (dias !== 0) {
          const minutos = dias * 24 * 60
          const deslocar = <T extends Etapa['chegadaRoteiro']>(i: T) => (i ? (somarMinutos(i, minutos) as T) : i)
          const lista = await etapas.where('viagemId').equals(viagem.id).toArray()
          await etapas.bulkPut(
            lista.map((e) => ({
              ...e,
              chegadaRoteiro: deslocar(e.chegadaRoteiro),
              janelaInicio: deslocar(e.janelaInicio),
              janelaFim: deslocar(e.janelaFim),
            })),
          )
        }
      }
      const { identificacao, equipe, ...resto } = viagem
      await viagens.put({
        ...resto,
        ...(identificacao?.trim() ? { identificacao: identificacao.trim() } : {}),
        ...(equipeValida(equipe) ? { equipe: equipeValida(equipe) } : {}),
        status: 'planejando',
        planoOriginal: null,
      })
    })
  }

  /** Remove a viagem com etapas, trechos, eventos e passageiros. Os locais (catálogo) ficam. */
  async excluirViagem(id: string): Promise<void> {
    this.#exigirRelogioDoEspaco()
    const { viagens, etapas, trechos, eventos, passageiros, consultas } = this.#db
    await this.#db.transaction('rw', [viagens, etapas, trechos, eventos, passageiros, consultas], async () => {
      const ids = (await etapas.where('viagemId').equals(id).primaryKeys()) as string[]
      await passageiros.where('viagemId').equals(id).delete()
      await consultas.where('viagemId').equals(id).delete()
      await trechos.where('etapaOrigemId').anyOf(ids).delete()
      await trechos.where('etapaDestinoId').anyOf(ids).delete()
      await etapas.where('viagemId').equals(id).delete()
      await eventos.where('viagemId').equals(id).delete()
      await viagens.delete(id)
    })
  }

  // ---------- Etapas ----------

  async listarEtapas(viagemId: string): Promise<Etapa[]> {
    this.#exigirRelogioDoEspaco()
    return normalizarOrdem(await this.#db.etapas.where('viagemId').equals(viagemId).toArray())
  }

  /**
   * Grava a etapa. Etapa nova entra no fim do meio (antes do destino). Renumera a
   * ordem e apaga trechos que deixaram de fazer sentido. Só com a viagem planejando.
   */
  async salvarEtapa(etapa: Etapa): Promise<void> {
    this.#exigirRelogioDoEspaco()
    const { viagens, etapas, trechos } = this.#db
    await this.#db.transaction('rw', viagens, etapas, trechos, async () => {
      await this.#exigirPlanejando(etapa.viagemId)
      const existentes = await etapas.where('viagemId').equals(etapa.viagemId).toArray()
      await etapas.bulkPut(etapasAposSalvar(existentes, etapa))
      await this.#limparTrechosOrfaos(etapa.viagemId)
    })
  }

  async excluirEtapa(etapaId: string): Promise<void> {
    this.#exigirRelogioDoEspaco()
    const { viagens, etapas, trechos } = this.#db
    await this.#db.transaction('rw', viagens, etapas, trechos, async () => {
      const etapa = await etapas.get(etapaId)
      if (!etapa) return
      await this.#exigirPlanejando(etapa.viagemId)
      await etapas.delete(etapaId)
      const restantes = await etapas.where('viagemId').equals(etapa.viagemId).toArray()
      await etapas.bulkPut(etapasAposExcluir(restantes, etapaId))
      await this.#limparTrechosOrfaos(etapa.viagemId)
    })
  }

  async moverEtapa(etapaId: string, sentido: 'subir' | 'descer'): Promise<void> {
    this.#exigirRelogioDoEspaco()
    const { viagens, etapas, trechos } = this.#db
    await this.#db.transaction('rw', viagens, etapas, trechos, async () => {
      const etapa = await etapas.get(etapaId)
      if (!etapa) return
      await this.#exigirPlanejando(etapa.viagemId)
      const todas = await etapas.where('viagemId').equals(etapa.viagemId).toArray()
      await etapas.bulkPut(moverEtapa(todas, etapaId, sentido))
      await this.#limparTrechosOrfaos(etapa.viagemId)
    })
  }

  // ---------- Prévia: trechos digitados que uma ação apagaria ----------

  /** Quantos trechos digitados à mão (fonte "manual") salvar esta etapa apagaria. */
  async contarManuaisApagadosAoSalvar(etapa: Etapa): Promise<number> {
    return this.#contarManuais(etapa.viagemId, (existentes) => etapasAposSalvar(existentes, etapa))
  }

  async contarManuaisApagadosAoMover(etapaId: string, sentido: 'subir' | 'descer'): Promise<number> {
    const etapa = await this.#db.etapas.get(etapaId)
    if (!etapa) return 0
    return this.#contarManuais(etapa.viagemId, (existentes) => moverEtapa(existentes, etapaId, sentido))
  }

  async contarManuaisApagadosAoExcluir(etapaId: string): Promise<number> {
    const etapa = await this.#db.etapas.get(etapaId)
    if (!etapa) return 0
    return this.#contarManuais(etapa.viagemId, (existentes) => etapasAposExcluir(existentes, etapaId))
  }

  async #contarManuais(viagemId: string, depois: (existentes: Etapa[]) => Etapa[]): Promise<number> {
    this.#exigirRelogioDoEspaco()
    const existentes = await this.#db.etapas.where('viagemId').equals(viagemId).toArray()
    const trechos = await this.listarTrechos(viagemId)
    return trechosQueDeixamDeValer(depois(existentes), trechos).filter((t) => t.fonte === 'manual').length
  }

  // ---------- Locais (catálogo) ----------

  async listarLocais(): Promise<Local[]> {
    this.#exigirRelogioDoEspaco()
    return this.#db.locais.toArray()
  }

  async salvarLocal(local: Local): Promise<void> {
    this.#exigirRelogioDoEspaco()
    await this.#db.locais.put(local)
  }

  /** Um local que alguma etapa usa não pode ser excluído. */
  async excluirLocal(id: string): Promise<void> {
    this.#exigirRelogioDoEspaco()
    const { locais, etapas } = this.#db
    await this.#db.transaction('rw', locais, etapas, async () => {
      const emUso = await etapas.filter((e) => e.localId === id || e.alternativas.includes(id)).count()
      if (emUso > 0) throw new LocalEmUso('Este local é usado em uma etapa.')
      await locais.delete(id)
    })
  }

  // ---------- Trechos ----------

  async listarTrechos(viagemId: string): Promise<Trecho[]> {
    this.#exigirRelogioDoEspaco()
    const ids = (await this.#db.etapas.where('viagemId').equals(viagemId).primaryKeys()) as string[]
    return this.#db.trechos.where('etapaOrigemId').anyOf(ids).toArray()
  }

  /** Duração digitada à mão (fonte "manual"). Substitui o trecho do mesmo par de locais. */
  async salvarTrechoManual(
    viagemId: string,
    par: Pick<Trecho, 'etapaOrigemId' | 'localOrigemId' | 'etapaDestinoId' | 'localDestinoId'>,
    duracaoMin: number,
  ): Promise<void> {
    this.#exigirRelogioDoEspaco()
    if (!Number.isInteger(duracaoMin) || duracaoMin <= 0) throw new RangeError('A duração precisa ser de pelo menos 1 minuto.')
    const { viagens, trechos } = this.#db
    await this.#db.transaction('rw', viagens, trechos, async () => {
      await this.#exigirPlanejando(viagemId)
      // A rota já calculada para o par (se houver) fica ao lado do tempo digitado.
      await trechos.put(trechoManualComRota(await trechos.get(chaveTrecho(par)), par, duracaoMin))
    })
  }

  /**
   * Guarda a rota calculada pelo serviço (fase 8), com a data de agora. Só no planejamento. Tempo
   * manual nunca é sobrescrito: a rota fica ao lado dele (`rota`). Recusa par que não existe mais
   * no roteiro (etapas vizinhas e locais candidatos).
   */
  async salvarRotaDoTrecho(
    viagemId: string,
    par: Pick<Trecho, 'etapaOrigemId' | 'localOrigemId' | 'etapaDestinoId' | 'localDestinoId'>,
    rota: RotaCalculada,
  ): Promise<void> {
    this.#exigirRelogioDoEspaco()
    if (!Number.isInteger(rota.minutosCarro) || rota.minutosCarro <= 0 || !Number.isFinite(rota.distanciaKm) || rota.distanciaKm < 0) {
      throw new RangeError('A rota calculada não é válida.')
    }
    const { viagens, etapas, trechos } = this.#db
    await this.#db.transaction('rw', viagens, etapas, trechos, async () => {
      await this.#exigirPlanejando(viagemId)
      const lista = await etapas.where('viagemId').equals(viagemId).toArray()
      const candidato: Trecho = { ...par, duracaoMin: rota.minutosCarro, fonte: 'rota' }
      if (trechosQueDeixamDeValer(lista, [candidato]).length > 0) throw new RangeError('Esse trecho não existe mais no roteiro.')
      await trechos.put(aplicarRota(await trechos.get(chaveTrecho(par)), par, rota, agora()))
    })
  }

  /** "Usar a rota": a rota guardada ao lado do manual vira o trecho e o tempo digitado deixa de existir. */
  async usarRotaNoLugarDoManual(
    viagemId: string,
    par: Pick<Trecho, 'etapaOrigemId' | 'localOrigemId' | 'etapaDestinoId' | 'localDestinoId'>,
  ): Promise<void> {
    this.#exigirRelogioDoEspaco()
    const { viagens, trechos } = this.#db
    await this.#db.transaction('rw', viagens, trechos, async () => {
      await this.#exigirPlanejando(viagemId)
      const atual = await trechos.get(chaveTrecho(par))
      const novo = atual ? usarRotaNoLugarDoManual(atual) : null
      if (!novo) throw new RangeError('Esse trecho não tem uma rota calculada ao lado do tempo manual.')
      await trechos.put(novo)
    })
  }

  /** "Manter o meu": o tempo manual fica e a rota guardada ao lado dele é descartada. */
  async manterTempoManual(
    viagemId: string,
    par: Pick<Trecho, 'etapaOrigemId' | 'localOrigemId' | 'etapaDestinoId' | 'localDestinoId'>,
  ): Promise<void> {
    this.#exigirRelogioDoEspaco()
    const { viagens, trechos } = this.#db
    await this.#db.transaction('rw', viagens, trechos, async () => {
      await this.#exigirPlanejando(viagemId)
      const atual = await trechos.get(chaveTrecho(par))
      if (atual?.fonte === 'manual' && atual.rota) await trechos.put(manterManual(atual))
    })
  }

  /** Fator ônibus da viagem (1,00 a 2,00). Só no planejamento: a previsão não muda em silêncio na viagem. */
  async salvarFatorOnibus(viagemId: string, fator: number): Promise<void> {
    this.#exigirRelogioDoEspaco()
    const erro = validarFatorOnibus(fator)
    if (erro) throw new RangeError(erro)
    const { viagens } = this.#db
    await this.#db.transaction('rw', viagens, async () => {
      await this.#exigirPlanejando(viagemId)
      await viagens.update(viagemId, { fatorOnibus: Math.round(fator * 100) / 100 })
    })
  }

  /**
   * Duração digitada à mão com a viagem em andamento (ex.: alternativa sem trecho). Só para
   * trecho ainda não percorrido e sem tempo (regras no núcleo). Não é um evento e não mexe
   * no plano original, que guarda horários.
   */
  async salvarTrechoManualEmViagem(
    viagemId: string,
    par: Pick<Trecho, 'etapaOrigemId' | 'localOrigemId' | 'etapaDestinoId' | 'localDestinoId'>,
    duracaoMin: number,
  ): Promise<{ ok: true } | { ok: false; motivo: string }> {
    this.#exigirRelogioDoEspaco()
    const { viagens, etapas, locais, trechos, eventos } = this.#db
    return this.#db.transaction('rw', viagens, etapas, locais, trechos, eventos, async () => {
      const dados = await this.carregarPlano(viagemId)
      const original = dados?.viagem.planoOriginal
      if (!dados || !original) return { ok: false as const, motivo: 'A viagem não está em andamento.' }
      const estado = calcularEstado(dados, original, await this.listarEventos(viagemId), agora())
      const r = validarTrechoManualEmViagem(dados, estado, par, duracaoMin)
      if (!r.ok) return r
      await trechos.put({ ...par, duracaoMin, fonte: 'manual' })
      return { ok: true as const }
    })
  }

  async removerTrecho(
    viagemId: string,
    par: Pick<Trecho, 'etapaOrigemId' | 'localOrigemId' | 'etapaDestinoId' | 'localDestinoId'>,
  ): Promise<void> {
    this.#exigirRelogioDoEspaco()
    const { viagens, trechos } = this.#db
    await this.#db.transaction('rw', viagens, trechos, async () => {
      await this.#exigirPlanejando(viagemId)
      await trechos.delete(chaveTrecho(par))
    })
  }

  // ---------- Passageiros ----------

  async listarPassageiros(viagemId: string): Promise<Passageiro[]> {
    this.#exigirRelogioDoEspaco()
    return this.#db.passageiros.where('viagemId').equals(viagemId).toArray()
  }

  /**
   * Cadastra ou edita um passageiro (nome, embarque, desembarque). As regras vêm do núcleo:
   * planejando vale tudo o que os selects oferecem; em andamento, só etapas de onde ainda
   * não saímos. O status gravado é sempre "ativo".
   */
  async salvarPassageiro(viagemId: string, dados: DadosPassageiro, id?: string): Promise<Passageiro> {
    this.#exigirRelogioDoEspaco()
    const { viagens, etapas, eventos, passageiros } = this.#db
    return this.#db.transaction('rw', viagens, etapas, eventos, passageiros, async () => {
      const viagem = await viagens.get(viagemId)
      if (!viagem) throw new EdicaoBloqueada('Viagem não encontrada.')
      const atual = id ? await passageiros.get(id) : undefined
      if (id && (!atual || atual.viagemId !== viagemId)) throw new EdicaoBloqueada('Passageiro não encontrado.')
      const lista = await etapas.where('viagemId').equals(viagemId).toArray()
      const historico = await eventos.where('viagemId').equals(viagemId).toArray()
      const r = validarCadastro(dados, lista, { statusViagem: viagem.status, eventos: historico, atual })
      if (!r.ok) throw new EdicaoBloqueada(r.motivo)
      const salvo: Passageiro = {
        id: atual?.id ?? novoId(),
        viagemId,
        nome: dados.nome.trim(),
        etapaEmbarqueId: dados.etapaEmbarqueId,
        etapaDesembarqueId: dados.etapaDesembarqueId,
        status: 'ativo',
      }
      await passageiros.put(salvo)
      return salvo
    })
  }

  async excluirPassageiro(passageiroId: string): Promise<void> {
    this.#exigirRelogioDoEspaco()
    const { viagens, eventos, passageiros } = this.#db
    await this.#db.transaction('rw', viagens, eventos, passageiros, async () => {
      const p = await passageiros.get(passageiroId)
      if (!p) return
      const viagem = await viagens.get(p.viagemId)
      if (!viagem) throw new EdicaoBloqueada('Viagem não encontrada.')
      const historico = await eventos.where('viagemId').equals(p.viagemId).toArray()
      const r = validarExclusao(passageiroId, { statusViagem: viagem.status, eventos: historico })
      if (!r.ok) throw new EdicaoBloqueada(r.motivo)
      await passageiros.delete(passageiroId)
    })
  }

  // ---------- Plano e início ----------

  /** Tudo o que o núcleo precisa do planejamento. */
  async carregarPlano(viagemId: string): Promise<DadosPlano | null> {
    this.#exigirRelogioDoEspaco()
    const viagem = await this.#db.viagens.get(viagemId)
    if (!viagem) return null
    const [etapas, locais, trechos] = await Promise.all([
      this.listarEtapas(viagemId),
      this.listarLocais(),
      this.listarTrechos(viagemId),
    ])
    return { viagem, etapas, locais, trechos }
  }

  /**
   * Congela o planejamento: calcula o plano original, grava, muda o status para
   * "em andamento" e registra o evento "início". Tudo ou nada, numa só transação.
   */
  async iniciarViagem(viagemId: string): Promise<ResultadoInicio> {
    this.#exigirRelogioDoEspaco()
    const { viagens, etapas, locais, trechos, eventos } = this.#db
    return this.#db.transaction('rw', viagens, etapas, locais, trechos, eventos, async (): Promise<ResultadoInicio> => {
      const viagem = await viagens.get(viagemId)
      if (!viagem) return { ok: false, motivo: 'viagem_inexistente' }
      if (viagem.status !== 'planejando') return { ok: false, motivo: 'nao_planejando' }

      const dados = await this.carregarPlano(viagemId)
      const momento = agora()
      const calculo = calcularPlanoOriginal(dados!, momento)
      if (!calculo.ok) return { ok: false, motivo: 'bloqueios', bloqueios: calculo.bloqueios }

      const iniciada: Viagem = { ...viagem, status: 'em_andamento', planoOriginal: calculo.plano }
      await viagens.put(iniciada)
      await eventos.add(criarEvento({ id: novoId(), viagemId, horarioFato: momento, registradoEm: momento }, { tipo: 'inicio' }))
      return { ok: true, viagem: iniciada }
    })
  }

  // ---------- Eventos da viagem ----------

  async listarEventos(viagemId: string): Promise<Evento[]> {
    this.#exigirRelogioDoEspaco()
    return this.#db.eventos.where('viagemId').equals(viagemId).toArray()
  }

  /**
   * Registra um evento no horário atual (ou em `horarioFato`, se anterior). As travas
   * vêm do núcleo. Chegada passa por `registrarChegada`, que trata a parada aberta.
   */
  async registrarEvento(viagemId: string, conteudo: ConteudoEvento, opcoes: OpcoesRegistro = {}): Promise<ResultadoRegistro> {
    if (conteudo.tipo === 'chegada') return this.registrarChegada(viagemId, conteudo.etapaId, opcoes)
    return this.#registrar(viagemId, [{ conteudo, ...opcoes }])
  }

  /**
   * CHEGAMOS. Com uma parada não planejada aberta, `retornoEm` (a que horas voltamos à
   * estrada) é obrigatório e o VOLTAMOS é gravado antes da chegada. Chegando no destino,
   * grava também o evento "fim" e conclui a viagem. Tudo numa transação.
   */
  async registrarChegada(
    viagemId: string,
    etapaId: string,
    opcoes: OpcoesRegistro & { retornoEm?: Instante } = {},
  ): Promise<ResultadoRegistro> {
    this.#exigirRelogioDoEspaco()
    const { viagens, etapas, locais, trechos, eventos, passageiros } = this.#db
    return this.#db.transaction('rw', [viagens, etapas, locais, trechos, eventos, passageiros], async (): Promise<ResultadoRegistro> => {
      const lista = await this.listarEventos(viagemId)
      const passos: Array<{ conteudo: ConteudoEvento; horarioFato?: Instante; observacao?: string }> = []
      if (paradaAberta(lista, etapaId)) {
        if (!opcoes.retornoEm) {
          return { ok: false, motivo: 'Há uma parada não planejada aberta: informe a que horas voltamos à estrada.' }
        }
        passos.push({
          conteudo: { tipo: 'parada_nao_planejada', etapaId, dados: { fase: 'fim' } },
          horarioFato: opcoes.retornoEm,
        })
      }
      passos.push({ conteudo: { tipo: 'chegada', etapaId }, horarioFato: opcoes.horarioFato, observacao: opcoes.observacao })
      return this.#registrar(viagemId, passos)
    })
  }

  // ---------- Consultas ao Google Maps ----------

  /** Todas as consultas guardadas da viagem (a vigência é calculada pelo núcleo). */
  async listarConsultas(viagemId: string): Promise<Consulta[]> {
    this.#exigirRelogioDoEspaco()
    return this.#db.consultas.where('viagemId').equals(viagemId).toArray()
  }

  /**
   * Guarda a consulta "chegando em <local> às HH:MM" (substitui a do mesmo local). Não é evento:
   * não altera a previsão nem aparece na timeline. Valida pelo núcleo e apaga as já descartadas.
   */
  async salvarConsulta(
    viagemId: string,
    etapaId: string,
    localId: string,
    horario: Instante,
  ): Promise<{ ok: true } | { ok: false; motivo: string }> {
    this.#exigirRelogioDoEspaco()
    const { viagens, etapas, locais, trechos, eventos, consultas } = this.#db
    return this.#db.transaction('rw', [viagens, etapas, locais, trechos, eventos, consultas], async () => {
      const dados = await this.carregarPlano(viagemId)
      const original = dados?.viagem.planoOriginal
      if (!dados || !original) return { ok: false as const, motivo: 'A viagem não está em andamento.' }
      const lista = await this.listarEventos(viagemId)
      const momento = agora()
      const r = validarConsulta(dados, original, lista, momento, etapaId, localId, horario)
      if (!r.ok) return r
      await this.#apagarConsultasDescartadas(viagemId, lista, momento)
      await consultas.put({
        viagemId,
        etapaId,
        localId,
        horario: truncarMinuto(horario),
        consultadoEm: truncarMinuto(momento),
        parado: r.parado,
        base: r.base,
      })
      return { ok: true as const }
    })
  }

  async descartarConsulta(viagemId: string, etapaId: string, localId: string): Promise<void> {
    this.#exigirRelogioDoEspaco()
    await this.#db.consultas.delete([viagemId, etapaId, localId])
  }

  /**
   * ESCOLHER uma alternativa consultada: troca de local e recalibração com a chegada da consulta
   * (`chegadaDaConsulta`, calculada no momento do registro), numa só transação. Para o local já
   * escolhido, só a recalibração (ATUALIZAR PREVISÃO). A consulta precisa estar vigente.
   */
  async aplicarConsulta(viagemId: string, etapaId: string, localId: string): Promise<ResultadoRegistro> {
    this.#exigirRelogioDoEspaco()
    const { viagens, etapas, locais, trechos, eventos, passageiros, consultas } = this.#db
    return this.#db.transaction('rw', [viagens, etapas, locais, trechos, eventos, passageiros, consultas], async (): Promise<ResultadoRegistro> => {
      const consulta = await consultas.get([viagemId, etapaId, localId])
      if (!consulta) return { ok: false, motivo: 'Não há consulta ao Google Maps para este local.' }
      const lista = await this.listarEventos(viagemId)
      const momento = agora()
      const { situacao } = vigenciaDaConsulta(consulta, lista, momento)
      if (situacao !== 'vigente') {
        return { ok: false, motivo: 'A consulta ao Google Maps não vale mais: consulte de novo.' }
      }
      const chegada = chegadaDaConsulta(consulta, momento)
      const dados = await this.carregarPlano(viagemId)
      const original = dados?.viagem.planoOriginal
      if (!dados || !original) return { ok: false, motivo: 'A viagem não está em andamento.' }
      const estado = calcularEstado(dados, original, lista, momento)
      const escolhido = estado.etapas.find((e) => e.etapaId === etapaId)?.localId === localId
      const r = escolhido
        ? await this.#registrar(viagemId, [{ conteudo: { tipo: 'recalibracao', etapaId, dados: { horario: chegada } } }])
        : await this.registrarTrocaComChegada(viagemId, etapaId, localId, chegada)
      if (r.ok) await consultas.delete([viagemId, etapaId, localId])
      return r
    })
  }

  async #apagarConsultasDescartadas(viagemId: string, eventos: readonly Evento[], momento: Instante): Promise<void> {
    const todas = await this.#db.consultas.where('viagemId').equals(viagemId).toArray()
    const velhas = todas.filter((c) => vigenciaDaConsulta(c, eventos, momento).situacao === 'descartada')
    await this.#db.consultas.bulkDelete(velhas.map((c) => [c.viagemId, c.etapaId, c.localId] as [string, string, string]))
  }

  /**
   * ESCOLHER uma alternativa cujo trecho em curso não tem tempo: grava, numa só transação, a
   * troca de local e a recalibração da etapa com a chegada informada pelo Google Maps. O
   * núcleo só aceita nesse caso (`validarTrocaComChegada`). Desfazer retira os dois.
   */
  async registrarTrocaComChegada(
    viagemId: string,
    etapaId: string,
    localId: string,
    chegada: Instante,
  ): Promise<ResultadoRegistro> {
    return this.#registrar(viagemId, [
      {
        conteudo: { tipo: 'troca_local', etapaId, dados: { localId } },
        validar: (d, original, lista, momento) => validarTrocaComChegada(d, original, lista, momento, etapaId, localId, chegada),
      },
      { conteudo: { tipo: 'recalibracao', etapaId, dados: { horario: chegada } } },
    ])
  }

  /**
   * SAÍMOS com conferência: grava, na mesma transação, a conferência, um status para cada
   * pendente e a saída. O DESFAZER desfaz tudo junto. O resultado da conferência vem do núcleo.
   */
  async registrarSaidaComConferencia(
    viagemId: string,
    etapaId: string,
    conferencia: { contexto: ContextoConferencia; estado: EstadoConferencia; decisoes: readonly DecisaoDePendente[] },
    opcoes: OpcoesRegistro = {},
  ): Promise<ResultadoRegistro> {
    const { contexto, estado, decisoes } = conferencia
    if (contexto.momento !== 'saida' || contexto.etapaId !== etapaId) {
      return { ok: false, motivo: 'A conferência não é da saída desta etapa.' }
    }
    return this.#registrar(viagemId, [
      ...eventosDaConferencia(contexto, estado, decisoes).map((conteudo) => ({ conteudo })),
      { conteudo: { tipo: 'saida', etapaId }, ...opcoes },
    ])
  }

  /**
   * VOLTAMOS com conferência: o fim da parada não planejada, a conferência (no modo
   * "só alguns") e os status dos pendentes, ligados à próxima etapa, numa transação.
   */
  async registrarVoltaComConferencia(
    viagemId: string,
    conferencia: { contexto: ContextoConferencia; estado: EstadoConferencia; decisoes: readonly DecisaoDePendente[] },
    opcoes: OpcoesRegistro = {},
  ): Promise<ResultadoRegistro> {
    const { contexto, estado, decisoes } = conferencia
    if (contexto.momento !== 'volta') return { ok: false, motivo: 'A conferência não é da volta à estrada.' }
    return this.#registrar(viagemId, [
      { conteudo: { tipo: 'parada_nao_planejada', etapaId: contexto.etapaId, dados: { fase: 'fim' } }, ...opcoes },
      ...eventosDaConferencia(contexto, estado, decisoes).map((conteudo) => ({ conteudo, ...(opcoes.horarioFato ? { horarioFato: opcoes.horarioFato } : {}) })),
    ])
  }

  /** Chegada ou saída esquecida (ver `pendenciasDeRegistro`): o horário vem digitado. */
  async registrarPendencia(
    viagemId: string,
    etapaId: string,
    momento: 'chegada' | 'saida',
    horarioFato: Instante,
  ): Promise<ResultadoRegistro> {
    this.#exigirRelogioDoEspaco()
    const { viagens, etapas, locais, trechos, eventos } = this.#db
    return this.#db.transaction('rw', viagens, etapas, locais, trechos, eventos, async (): Promise<ResultadoRegistro> => {
      const dados = await this.carregarPlano(viagemId)
      if (!dados) return { ok: false, motivo: 'Viagem não encontrada.' }
      const lista = await this.listarEventos(viagemId)
      if (!pendenciasDeRegistro(dados, lista).some((p) => p.etapaId === etapaId && p.momento === momento)) {
        return { ok: false, motivo: 'Este registro não está pendente.' }
      }
      const agoraDoRelogio = agora()
      const r = validarHorario(dados, lista, { tipo: momento, etapaId }, horarioFato, agoraDoRelogio)
      if (!r.ok) return r
      const evento = await this.#gravar(viagemId, lista, { tipo: momento, etapaId }, horarioFato, agoraDoRelogio, {})
      return { ok: true, eventos: [evento], viagem: dados.viagem }
    })
  }

  /**
   * Desfaz os eventos de um registro (os ids que o registro devolveu), mas só se ainda
   * forem os últimos da viagem, pela sequência de gravação. Desfazer a chegada no destino
   * reabre a viagem.
   */
  async desfazerRegistro(viagemId: string, ids: readonly string[]): Promise<{ ok: true } | { ok: false; motivo: string }> {
    this.#exigirRelogioDoEspaco()
    const { viagens, eventos } = this.#db
    return this.#db.transaction('rw', viagens, eventos, async () => {
      // A atualização gerada não é um registro da viagem: o desfazer a ignora.
      const lista = (await this.listarEventos(viagemId))
        .filter((e) => e.tipo !== 'atualizacao_gerada')
        .sort((a, b) => (b.sequencia ?? 0) - (a.sequencia ?? 0))
      const ultimos = lista.slice(0, ids.length)
      const mesmos = ids.length > 0 && ultimos.length === ids.length && ultimos.every((e) => ids.includes(e.id))
      if (!mesmos) return { ok: false as const, motivo: 'Já houve outro registro depois: corrija pela timeline.' }
      if (ultimos.some((e) => e.tipo === 'inicio')) return { ok: false as const, motivo: 'O início da viagem não pode ser desfeito.' }
      await eventos.bulkDelete(ids as string[])
      if (ultimos.some((e) => e.tipo === 'fim')) {
        const viagem = await viagens.get(viagemId)
        if (viagem?.status === 'concluida') await viagens.put({ ...viagem, status: 'em_andamento' })
      }
      return { ok: true as const }
    })
  }

  /** Corrige o horário do fato de uma chegada ou saída, com as travas do núcleo. */
  async corrigirHorarioDoEvento(
    viagemId: string,
    eventoId: string,
    novoHorario: Instante,
  ): Promise<{ ok: true } | { ok: false; motivo: string }> {
    this.#exigirRelogioDoEspaco()
    const { viagens, etapas, locais, trechos, eventos } = this.#db
    return this.#db.transaction('rw', viagens, etapas, locais, trechos, eventos, async () => {
      const dados = await this.carregarPlano(viagemId)
      if (!dados) return { ok: false as const, motivo: 'Viagem não encontrada.' }
      const lista = await this.listarEventos(viagemId)
      const r = validarCorrecao(dados, lista, eventoId, novoHorario, agora())
      if (!r.ok) return r
      const evento = lista.find((e) => e.id === eventoId)!
      await eventos.put(corrigirHorario(evento, novoHorario))
      // A chegada no destino e o "fim" são o mesmo instante.
      const destino = dados.etapas.find((e) => e.tipo === 'destino')
      if (evento.tipo === 'chegada' && evento.etapaId === destino?.id) {
        const fim = lista.find((e) => e.tipo === 'fim')
        if (fim) await eventos.put(corrigirHorario(fim, novoHorario))
      }
      return { ok: true as const }
    })
  }

  /** Corrige o texto e o horário de uma observação pela timeline (o horário não pode ser depois de agora). */
  async corrigirObservacao(
    viagemId: string,
    eventoId: string,
    texto: string,
    novoHorario: Instante,
  ): Promise<{ ok: true } | { ok: false; motivo: string }> {
    this.#exigirRelogioDoEspaco()
    const { eventos } = this.#db
    return this.#db.transaction('rw', eventos, async () => {
      const lista = await this.listarEventos(viagemId)
      const r = validarCorrecaoDaObservacao(lista, eventoId, texto, novoHorario, agora())
      if (!r.ok) return r
      const evento = lista.find((e) => e.id === eventoId)
      if (evento?.tipo !== 'observacao') return { ok: false as const, motivo: 'Este evento não é uma observação.' }
      await eventos.put({ ...evento, horarioFato: corrigirHorario(evento, novoHorario).horarioFato, dados: { texto: texto.trim() } })
      return { ok: true as const }
    })
  }

  // ---------- Modelos de mensagem ----------

  /** O texto salvo de cada modelo; `null` = sem linha gravada (vale o padrão). */
  async obterModelos(): Promise<Record<IdModelo, string | null>> {
    this.#exigirRelogioDoEspaco()
    const linhas = await this.#db.modelos.toArray()
    const texto = (id: IdModelo) => linhas.find((l) => l.id === id)?.texto ?? null
    return { atualizacao: texto('atualizacao'), restaurante: texto('restaurante') }
  }

  /** Salva o modelo se não estiver vazio e só tiver variáveis conhecidas. */
  async salvarModelo(id: IdModelo, texto: string): Promise<{ ok: true } | { ok: false; motivo: string }> {
    this.#exigirRelogioDoEspaco()
    const r = validarModelo(id, texto)
    if (!r.ok) return r
    await this.#db.modelos.put({ id, texto, atualizadoEm: truncarMinuto(agora()) })
    return { ok: true }
  }

  /** Volta ao modelo padrão: apaga a linha gravada. */
  async restaurarModelo(id: IdModelo): Promise<void> {
    this.#exigirRelogioDoEspaco()
    await this.#db.modelos.delete(id)
  }

  async #registrar(
    viagemId: string,
    passos: Array<{
      conteudo: ConteudoEvento
      horarioFato?: Instante
      observacao?: string
      /** Troca a validação padrão (usada pela troca com chegada informada). */
      validar?: (d: DadosPlano, original: NonNullable<Viagem['planoOriginal']>, lista: readonly Evento[], momento: Instante) => ReturnType<typeof validarRegistro>
    }>,
  ): Promise<ResultadoRegistro> {
    this.#exigirRelogioDoEspaco()
    const { viagens, etapas, locais, trechos, eventos, passageiros } = this.#db
    return this.#db.transaction('rw', [viagens, etapas, locais, trechos, eventos, passageiros], async (): Promise<ResultadoRegistro> => {
      const dados = await this.carregarPlano(viagemId)
      if (!dados) return { ok: false, motivo: 'Viagem não encontrada.' }
      const original = dados.viagem.planoOriginal
      if (!original) return { ok: false, motivo: 'A viagem ainda não foi iniciada.' }
      const momento = agora()
      let lista = await this.listarEventos(viagemId)
      const todosPassageiros = await this.listarPassageiros(viagemId)
      const criados: Evento[] = []
      let viagem = dados.viagem
      for (const passo of passos) {
        const horario = passo.horarioFato ?? momento
        const r = passo.validar
          ? passo.validar({ ...dados, viagem }, original, lista, momento)
          : validarRegistro({ ...dados, viagem }, original, lista, passo.conteudo, horario, momento, todosPassageiros)
        if (!r.ok) return r
        const evento = await this.#gravar(viagemId, lista, passo.conteudo, horario, momento, { observacao: passo.observacao })
        criados.push(evento)
        lista = [...lista, evento]
        const destino = dados.etapas.find((e) => e.tipo === 'destino')
        if (passo.conteudo.tipo === 'chegada' && passo.conteudo.etapaId === destino?.id) {
          const fim = await this.#gravar(viagemId, lista, { tipo: 'fim' }, horario, momento, {})
          criados.push(fim)
          lista = [...lista, fim]
          viagem = { ...viagem, status: 'concluida' }
          await viagens.put(viagem)
        }
      }
      return { ok: true, eventos: criados, viagem }
    })
  }

  async #gravar(
    viagemId: string,
    lista: readonly Evento[],
    conteudo: ConteudoEvento,
    horarioFato: Instante,
    registradoEm: Instante,
    extra: { observacao?: string },
  ): Promise<Evento> {
    const sequencia = lista.reduce((m, e) => Math.max(m, e.sequencia ?? 0), 0) + 1
    const evento = criarEvento(
      {
        id: novoId(),
        viagemId,
        horarioFato,
        registradoEm,
        sequencia,
        ...(extra.observacao ? { observacao: extra.observacao } : {}),
      },
      conteudo,
    )
    await this.#db.eventos.add(evento)
    return evento
  }

  // ---------- Backup (fase 10a) ----------

  #exigirEspacoReal(): void {
    if (this.espaco !== 'real') throw new ErroDeEspaco('Backup e restauração só existem no espaço real, nunca na demonstração.')
  }

  /** Tudo do espaço real, numa leitura só; as consultas ao Google Maps ficam de fora. */
  async lerTudoParaBackup(): Promise<ConteudoBackup> {
    this.#exigirRelogioDoEspaco()
    this.#exigirEspacoReal()
    const { viagens, etapas, locais, trechos, eventos, passageiros, modelos } = this.#db
    return this.#db.transaction('r', [viagens, etapas, locais, trechos, eventos, passageiros, modelos], async () => ({
      viagens: await viagens.toArray(),
      etapas: await etapas.toArray(),
      locais: await locais.toArray(),
      trechos: await trechos.toArray(),
      eventos: await eventos.toArray(),
      passageiros: await passageiros.toArray(),
      modelos: await modelos.toArray(),
    }))
  }

  async gerarBackup(): Promise<Backup> {
    return montarBackup(await this.lerTudoParaBackup(), truncarMinuto(agora()))
  }

  /** As viagens do celular, no mesmo resumo do arquivo (para comparar antes de restaurar). */
  async resumirViagensDoCelular(): Promise<ResumoViagem[]> {
    return resumirViagens(await this.lerTudoParaBackup())
  }

  /** Marca o backup como entregue (menu de compartilhar aceito ou download disparado). */
  async registrarBackupEntregue(backup: Pick<Backup, 'geradoEm' | 'conteudo'>): Promise<void> {
    this.#exigirRelogioDoEspaco()
    this.#exigirEspacoReal()
    await this.#db.meta.bulkPut([
      { chave: 'ultimoBackup', valor: { geradoEm: backup.geradoEm, totalEventos: backup.conteudo.eventos.length } },
    ])
    await this.#db.meta.delete('silencioBackupAte')
  }

  async obterUltimoBackup(): Promise<UltimoBackup | null> {
    this.#exigirRelogioDoEspaco()
    const linha = await this.#db.meta.get('ultimoBackup')
    return linha?.chave === 'ultimoBackup' ? linha.valor : null
  }

  /** Quantos registros (eventos) o espaço tem hoje, para contar os feitos depois do último backup. */
  async contarEventos(): Promise<number> {
    this.#exigirRelogioDoEspaco()
    return this.#db.eventos.count()
  }

  async obterSilencioDoBackup(): Promise<Instante | null> {
    this.#exigirRelogioDoEspaco()
    const linha = await this.#db.meta.get('silencioBackupAte')
    return linha?.chave === 'silencioBackupAte' ? linha.valor : null
  }

  /** "AGORA NÃO": a sugestão de backup some até `ate`. */
  async silenciarSugestaoDeBackup(ate: Instante): Promise<void> {
    this.#exigirRelogioDoEspaco()
    await this.#db.meta.put({ chave: 'silencioBackupAte', valor: ate })
  }

  async obterRestauradoDe(): Promise<RestauradoDe | null> {
    this.#exigirRelogioDoEspaco()
    const linha = await this.#db.meta.get('restauradoDe')
    return linha?.chave === 'restauradoDe' ? linha.valor : null
  }

  async dispensarAvisoDeRestauracao(): Promise<void> {
    this.#exigirRelogioDoEspaco()
    const atual = await this.obterRestauradoDe()
    if (atual) await this.#db.meta.put({ chave: 'restauradoDe', valor: { ...atual, dispensado: true } })
  }

  /**
   * Grava o backup (já validado) no celular, tudo ou nada.
   * - `juntar`: cada viagem escolhida substitui, inteira, a de mesmo id (viagem, etapas, trechos,
   *   eventos e passageiros; nunca misturados, por causa da sequência dos eventos); as outras
   *   viagens do celular ficam. Os locais do arquivo entram e vencem os de mesmo id; os modelos
   *   do arquivo só entram onde o celular não tem modelo editado.
   * - `substituir_tudo`: o espaço real vira o arquivo.
   * Os registros são gravados como estão: nada é recalculado, o plano original não é refeito.
   * As consultas ao Google Maps das viagens substituídas são apagadas (dependem da sequência).
   */
  async restaurarBackup(backup: Backup, opcoes: OpcoesDeRestauracao): Promise<ResultadoRestauracao> {
    this.#exigirRelogioDoEspaco()
    this.#exigirEspacoReal()
    const c = backup.conteudo
    const escolhidas = opcoes.modo === 'substituir_tudo' ? c.viagens.map((v) => v.id) : [...new Set(opcoes.viagemIds)]
    if (opcoes.modo === 'juntar') {
      if (escolhidas.length === 0) return { ok: false, motivo: 'Escolha ao menos uma viagem para restaurar.' }
      const noArquivo = new Set(c.viagens.map((v) => v.id))
      if (escolhidas.some((id) => !noArquivo.has(id))) return { ok: false, motivo: 'Uma das viagens escolhidas não está no arquivo.' }
    }
    const { viagens, etapas, locais, trechos, eventos, passageiros, consultas, modelos, meta } = this.#db
    const todas = [viagens, etapas, locais, trechos, eventos, passageiros, consultas, modelos, meta]
    await this.#db.transaction('rw', todas, async () => {
      if (opcoes.modo === 'substituir_tudo') {
        await Promise.all([viagens, etapas, locais, trechos, eventos, passageiros, consultas, modelos].map((t) => t.clear()))
        await modelos.bulkPut(c.modelos)
      } else {
        for (const id of escolhidas) {
          const ids = (await etapas.where('viagemId').equals(id).primaryKeys()) as string[]
          await passageiros.where('viagemId').equals(id).delete()
          await consultas.where('viagemId').equals(id).delete()
          await trechos.where('etapaOrigemId').anyOf(ids).delete()
          await trechos.where('etapaDestinoId').anyOf(ids).delete()
          await etapas.where('viagemId').equals(id).delete()
          await eventos.where('viagemId').equals(id).delete()
          await viagens.delete(id)
        }
        const existentes = new Set((await modelos.toCollection().primaryKeys()) as string[])
        await modelos.bulkPut(c.modelos.filter((m) => !existentes.has(m.id)))
      }
      const doEscolhido = new Set(escolhidas)
      const etapasEscolhidas = c.etapas.filter((e) => doEscolhido.has(e.viagemId))
      const idsDasEtapas = new Set(etapasEscolhidas.map((e) => e.id))
      await locais.bulkPut(c.locais)
      await viagens.bulkPut(c.viagens.filter((v) => doEscolhido.has(v.id)))
      await etapas.bulkPut(etapasEscolhidas)
      await trechos.bulkPut(c.trechos.filter((t) => idsDasEtapas.has(t.etapaOrigemId) && idsDasEtapas.has(t.etapaDestinoId)))
      await eventos.bulkPut(c.eventos.filter((e) => doEscolhido.has(e.viagemId)))
      await passageiros.bulkPut(c.passageiros.filter((p) => doEscolhido.has(p.viagemId)))

      await meta.put({ chave: 'restauradoDe', valor: { geradoEm: backup.geradoEm, restauradoEm: truncarMinuto(agora()), viagemIds: escolhidas, dispensado: false } })
      await meta.delete('silencioBackupAte')
      // O celular só passa a valer como "igual ao arquivo" se nenhuma viagem ficou de fora com
      // registros que o arquivo não tem; senão o último backup continua sendo o anterior.
      if ((await eventos.count()) === c.eventos.length) {
        await meta.put({ chave: 'ultimoBackup', valor: { geradoEm: backup.geradoEm, totalEventos: c.eventos.length } })
      }
    })
    return { ok: true, viagemIds: escolhidas }
  }

  // ---------- Limpeza ----------

  /** Esvazia o banco deste espaço (usado ao reiniciar a demonstração). */
  async limparTudo(): Promise<void> {
    this.#exigirRelogioDoEspaco()
    const { viagens, etapas, locais, trechos, eventos, passageiros, consultas } = this.#db
    await this.#db.transaction('rw', [viagens, etapas, locais, trechos, eventos, passageiros, consultas], async () => {
      await Promise.all([viagens.clear(), etapas.clear(), locais.clear(), trechos.clear(), eventos.clear(), passageiros.clear(), consultas.clear()])
    })
  }

  /** Grava um plano completo de uma vez (semente da demonstração). */
  async gravarPlano(dados: DadosPlano, listaDePassageiros: readonly Passageiro[] = []): Promise<void> {
    this.#exigirRelogioDoEspaco()
    const { viagens, etapas, locais, trechos, passageiros } = this.#db
    await this.#db.transaction('rw', viagens, etapas, locais, trechos, passageiros, async () => {
      await passageiros.bulkPut([...listaDePassageiros])
      await viagens.put(dados.viagem)
      await etapas.bulkPut(dados.etapas)
      await locais.bulkPut(dados.locais)
      await trechos.bulkPut(dados.trechos)
    })
  }

  // ---------- Internos ----------

  async #exigirPlanejando(viagemId: string): Promise<void> {
    const viagem = await this.#db.viagens.get(viagemId)
    if (!viagem) throw new EdicaoBloqueada('Viagem não encontrada.')
    if (viagem.status !== 'planejando') {
      throw new EdicaoBloqueada('A viagem já foi iniciada: o planejamento não pode mais ser editado.')
    }
  }

  /** Trechos só existem entre etapas vizinhas e entre locais que ainda são candidatos. */
  async #limparTrechosOrfaos(viagemId: string): Promise<void> {
    const { etapas, trechos } = this.#db
    const lista = await etapas.where('viagemId').equals(viagemId).toArray()
    const existentes = await trechos.where('etapaOrigemId').anyOf(lista.map((e) => e.id)).toArray()
    await trechos.bulkDelete(trechosQueDeixamDeValer(lista, existentes).map(chaveTrecho))
  }
}
