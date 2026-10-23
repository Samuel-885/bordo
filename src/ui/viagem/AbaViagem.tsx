// Aba "Viagem" (tela principal). Responde em segundos: onde estamos, próxima etapa, quanto
// falta, previsão e atraso. Nenhuma regra aqui: a situação, as travas e o cálculo vêm do núcleo.

import { CONFIG } from '../../core/config'
import { marcacaoDeDescida } from '../../core/conferencia'
import { temAlternativasPendentes } from '../../core/viabilidade'
import { somarMinutos } from '../../core/tempo'
import { CampoHora } from '../componentes/CampoHora'
import { Hora } from '../componentes/Hora'
import { Topo } from '../componentes/Topo'
import { dataHoraCurta, linhaDoUltimoBackup } from '../logica/backup'
import { resolverHorarioPassado } from '../logica/horarioDigitado'
import { formatarHora } from '../logica/horarios'
import { nomeDaEtapa } from '../logica/textos'
import {
  textoABordo,
  textoDaOrigemDaPrevisao,
  textoDaSituacao,
  textoDoAtraso,
  textoDoCronometro,
  textoDoTempoRestante,
  formatarDuracaoCurta,
} from '../logica/textosViagem'
import type { ContextoDaViagem } from './dados'
import type { Derivados } from './derivados'
import type { Registros } from './useRegistros'

interface Props {
  c: ContextoDaViagem
  d: Derivados
  r: Registros
  onVoltar: () => void
  onTimeline: () => void
  onPassageiros: () => void
  onAlternativas: () => void
  onBackup: () => void
}

export function AbaViagem({ c, d, r, onVoltar, onTimeline, onPassageiros, onAlternativas, onBackup }: Props) {
  const { repo, plano, eventos, passageiros, agora, recarregar } = c
  const { viagem, locais } = plano
  const { s, nome, localDe, proxima, proximaEtapa, mapa, podeRecalibrar, podePular, pendencia, concluida, estadoBackup, sugerirBackup, restaurada, primeira, ultima, cidadeDe, destino, destinoOriginal, classe, nomeLocalParado, chegadaProxima, saidaOrigem, aBordo } = d
  const { acao, abrir, ocupado, erro, setErro, horaPendente, setHoraPendente, registrar } = r
  const { aoSair, aoVoltar, aoChegar, contextoDeDescida } = r

  /** "Marcar quem desceu" no cartão da parada: marca ou corrige a qualquer momento. */
  function botaoMarcarDescida(local: 'etapa' | 'nao_planejada', etapaId: string) {
    if (passageiros.length === 0 || contextoDeDescida(local, etapaId).aBordo.length === 0) return null
    const marcados = marcacaoDeDescida(eventos, local, etapaId)
    return (
      <>
        {marcados !== null && <p className="dica">Desceram: {marcados.length}</p>}
        <button type="button" className="botao pequeno largo" disabled={ocupado} onClick={() => { setErro(null); r.setDescida({ local, etapaId, automatica: false }) }}>
          Marcar quem desceu
        </button>
      </>
    )
  }

  return (
    <>
      <Topo
        titulo={viagem.nome || 'Viagem'}
        onVoltar={onVoltar}
        rotuloVoltar="Voltar às viagens"
        direita={
          <button type="button" className="botao-topo" onClick={onTimeline}>
            Timeline
          </button>
        }
      />
      <main className="conteudo viagem">
        <section className="cartao situacao" aria-label="Situação">
          <p className="rota">
            {cidadeDe(primeira?.id)} → {cidadeDe(ultima?.id)}
          </p>
          <p className="estado-viagem">{textoDaSituacao(s.situacao, nomeLocalParado)}</p>
        </section>

        {restaurada && (
          <section className="cartao atencao cartao-backup" aria-label="Viagem restaurada" data-teste="aviso-restaurada">
            <h2>Restaurada de um backup</h2>
            <p>Restaurada do backup de {dataHoraCurta(restaurada.geradoEm)}. O que aconteceu depois não está aqui: registre pela timeline.</p>
            <div className="duas-colunas">
              <button type="button" className="botao pequeno" onClick={onTimeline}>
                Timeline
              </button>
              <button type="button" className="botao pequeno" onClick={() => void repo.dispensarAvisoDeRestauracao().then(recarregar)}>
                Entendi
              </button>
            </div>
          </section>
        )}

        <section className={`cartao previsao ${classe?.situacao === 'atrasado' ? 'atencao' : ''}`} aria-label="Previsão no destino">
          <div className="duas-colunas">
            <div>
              <h2>Previsão original</h2>
              {destinoOriginal ? <Hora instante={destinoOriginal} agora={agora} /> : <span>—</span>}
            </div>
            <div>
              <h2>{concluida ? 'Chegada real' : 'Previsão atual'}</h2>
              {destino ? <Hora instante={destino.instante} agora={agora} /> : <span>sem tempo definido</span>}
            </div>
          </div>
          {classe && (
            <p className={`atraso ${classe.situacao}`} aria-live="polite">
              {classe.situacao === 'no_horario' ? 'No horário' : textoDoAtraso(classe.minutos)}
              {classe.situacao === 'no_horario' && classe.minutos !== 0 ? ` (${classe.minutos > 0 ? '+' : '−'}${Math.abs(classe.minutos)} min)` : ''}
            </p>
          )}
          {concluida && <p className="dica">Viagem encerrada. O relatório completo chega na fase 10.</p>}
        </section>

        {s.situacao === 'aguardando_saida' && saidaOrigem && (
          <section className="cartao" aria-label="Saída">
            <h2>Saída prevista</h2>
            <p className="linha-grande">
              <Hora instante={saidaOrigem.instante} agora={agora} />
              {saidaOrigem.atrasoMin !== null && saidaOrigem.atrasoMin !== 0 && (
                <span className="suave"> · {textoDoAtraso(saidaOrigem.atrasoMin)}</span>
              )}
            </p>
          </section>
        )}

        {s.cronometro && (
          <section className={`cartao ${s.cronometro.excedeuMin > 0 ? 'atencao' : ''}`} aria-label="Cronômetro da parada">
            <h2>Parada em {nome(s.etapaAtualId)}</h2>
            <p className="cronometro">{textoDoCronometro(s.cronometro)}</p>
            <p className="dica">
              Planejado {formatarDuracaoCurta(s.cronometro.planejadoMin)} · decorrido {formatarDuracaoCurta(s.cronometro.decorridoMin)}
            </p>
            {botaoMarcarDescida('etapa', s.cronometro.etapaId)}
          </section>
        )}

        {s.paradaNaoPlanejada && (
          <section className="cartao atencao" aria-label="Parada não planejada">
            <h2>Parada não planejada</h2>
            <p className="cronometro">parados há {formatarDuracaoCurta(s.paradaNaoPlanejada.decorridoMin)}</p>
            <p className="dica">
              Desde as {formatarHora(s.paradaNaoPlanejada.inicio)}
              {s.paradaNaoPlanejada.onde ? ` · ${s.paradaNaoPlanejada.onde}` : ''}.
            </p>
            {s.paradaNaoPlanejada.tempoPrevistoMin !== undefined && (
              <p className="linha">
                Previsto {formatarDuracaoCurta(s.paradaNaoPlanejada.tempoPrevistoMin)}
                <span className="suave"> · {textoDoCronometro({ faltaMin: s.paradaNaoPlanejada.faltaMin ?? 0, excedeuMin: s.paradaNaoPlanejada.excedeuMin ?? 0 })}</span>
              </p>
            )}
            <button type="button" className="botao" onClick={() => abrir('ajuste_parada')}>
              {s.paradaNaoPlanejada.tempoPrevistoMin !== undefined || s.paradaNaoPlanejada.onde ? 'Alterar lugar e tempo previsto' : 'Definir tempo previsto'}
            </button>
            {botaoMarcarDescida('nao_planejada', s.paradaNaoPlanejada.etapaId)}
          </section>
        )}

        {proxima && proximaEtapa && !concluida && (
          <section className="cartao" aria-label="Próxima etapa">
            <h2>Próxima etapa</h2>
            <p className="linha-grande">{nomeDaEtapa(proximaEtapa, locais)}</p>
            {(localDe(proxima)?.nome ?? 'Local não escolhido') !== nomeDaEtapa(proximaEtapa, locais) && (
              <p className="suave">{localDe(proxima)?.nome ?? 'Local não escolhido'}</p>
            )}
            {chegadaProxima ? (
              <>
                <p className="linha">
                  Chegada estimada <Hora instante={chegadaProxima.instante} agora={agora} />
                  <span className="suave"> · falta {textoDoTempoRestante(chegadaProxima.instante, agora)}</span>
                </p>
                {textoDaOrigemDaPrevisao(chegadaProxima) && <p className="dica">{textoDaOrigemDaPrevisao(chegadaProxima)}</p>}
              </>
            ) : (
              <p className="dica">Sem tempo definido para este trecho.</p>
            )}
          </section>
        )}

        {aBordo && (
          <button type="button" className="cartao a-bordo" onClick={onPassageiros}>
            <h2>A bordo</h2>
            <span className="linha-grande">{textoABordo(aBordo)}</span>
          </button>
        )}

        {!concluida && (
          <button type="button" className="botao largo" onClick={() => { setErro(null); r.setPrevia(true) }}>
            GERAR ATUALIZAÇÃO
          </button>
        )}

        {sugerirBackup && estadoBackup && (
          <section className="cartao cartao-backup" aria-label="Sugestão de backup" data-teste="sugestao-backup">
            <h2>Backup</h2>
            <p>{linhaDoUltimoBackup(estadoBackup, agora)}. Vale guardar um backup agora.</p>
            <div className="duas-colunas">
              <button type="button" className="botao pequeno principal" onClick={onBackup}>
                FAZER BACKUP
              </button>
              <button
                type="button"
                className="botao pequeno"
                onClick={() => void repo.silenciarSugestaoDeBackup(somarMinutos(agora, CONFIG.backupSilencioHoras * 60)).then(recarregar)}
              >
                AGORA NÃO
              </button>
            </div>
          </section>
        )}

        {erro && acao === null && <p className="msg-erro" role="alert">{erro}</p>}

        {pendencia && !concluida ? (
          <section className="cartao atencao" aria-label="Registro esquecido">
            <h2>Falta um horário</h2>
            <p>
              {pendencia.momento === 'chegada' ? 'Chegada em' : 'Saída de'} {nome(pendencia.etapaId)} não foi registrada. A que horas foi?
            </p>
            <CampoHora
              id="pendencia-hora"
              rotulo="Horário"
              valor={horaPendente}
              onMudar={setHoraPendente}
              resolvido={resolverHorarioPassado(horaPendente, agora)}
              agora={agora}
            />
            <button
              type="button"
              className="botao principal largo"
              disabled={ocupado || resolverHorarioPassado(horaPendente, agora) === null}
              onClick={async () => {
                const quando = resolverHorarioPassado(horaPendente, agora)
                if (!quando) return
                const ok = await registrar(() => repo.registrarPendencia(viagem.id, pendencia.etapaId, pendencia.momento, quando), 'Horário registrado.')
                if (ok) setHoraPendente('')
              }}
            >
              Registrar horário
            </button>
          </section>
        ) : (
          !concluida && (
            <>
              {s.situacao === 'aguardando_saida' || s.situacao === 'em_parada' ? (
                <button type="button" className="botao-principal" disabled={ocupado} onClick={() => s.etapaAtualId && void aoSair(s.etapaAtualId)}>
                  SAÍMOS
                </button>
              ) : s.situacao === 'em_viagem' ? (
                <button type="button" className="botao-principal" disabled={ocupado} onClick={() => proxima && void aoChegar(proxima)}>
                  CHEGAMOS
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="botao-principal"
                    disabled={ocupado}
                    onClick={() => s.paradaNaoPlanejada && void aoVoltar(s.paradaNaoPlanejada.etapaId)}
                  >
                    VOLTAMOS
                  </button>
                  <button type="button" className="botao largo" disabled={ocupado} onClick={() => abrir('volta')}>
                    CHEGAMOS (sem registrar a volta antes)
                  </button>
                </>
              )}

              <div className="secundarias">
                {mapa && (
                  <a className="botao link-botao" href={mapa} target="_blank" rel="noopener noreferrer">
                    ABRIR NO GOOGLE MAPS
                  </a>
                )}
                {podeRecalibrar && (
                  <button type="button" className="botao" onClick={() => abrir('recalibracao')}>
                    ATUALIZAR PREVISÃO
                  </button>
                )}
                {s.situacao === 'em_viagem' && (
                  <button type="button" className="botao" onClick={() => abrir('parada')}>
                    PARAMOS
                  </button>
                )}
                <button type="button" className="botao" onClick={() => abrir('imprevisto')}>
                  REGISTRAR IMPREVISTO
                </button>
                <button type="button" className="botao" onClick={() => abrir('observacao')}>
                  OBSERVAÇÃO
                </button>
                <button type="button" className="botao" onClick={onPassageiros}>
                  PASSAGEIROS
                </button>
                {temAlternativasPendentes(plano, s.estado) && (
                  <button type="button" className="botao" onClick={onAlternativas}>
                    VER ALTERNATIVAS
                  </button>
                )}
                {podePular && (
                  <button type="button" className="botao" onClick={() => abrir('pular')}>
                    PULAR ETAPA
                  </button>
                )}
              </div>
            </>
          )
        )}
        {estadoBackup && (
          <button type="button" className={`botao-texto linha-backup${estadoBackup.defasado ? ' atencao' : ''}`} onClick={onBackup} data-teste="linha-backup">
            {linhaDoUltimoBackup(estadoBackup, agora)}
          </button>
        )}
      </main>
    </>
  )
}
