// Aba "Viagem" (tela principal). Responde em segundos: onde estamos, próxima parada, quanto
// falta, previsão e atraso. Nenhuma regra aqui: a situação, as travas e o cálculo vêm do núcleo.
// A ação principal e as rápidas ficam no rodapé fixo (BarraDeAcao).

import { marcacaoDeDescida } from '../../core/conferencia'
import { CONFIG } from '../../core/config'
import { somarMinutos } from '../../core/tempo'
import { CampoHora } from '../componentes/CampoHora'
import { Hora } from '../componentes/Hora'
import { dataHoraCurta, linhaDoUltimoBackup } from '../logica/backup'
import { resolverHorarioPassado } from '../logica/horarioDigitado'
import { formatarHora } from '../logica/horarios'
import { nomeDaEtapa } from '../logica/textos'
import {
  formatarDuracaoCurta,
  textoABordo,
  textoDaOrigemDaPrevisao,
  textoDaSituacao,
  textoDoAtalhoDeAlternativas,
  textoDoAtraso,
  textoDoCronometro,
  textoDoCronometroDeSaida,
  textoDoTempoRestante,
} from '../logica/textosViagem'
import { SeloDeAtraso } from './SeloDeAtraso'
import type { Aba } from '../componentes/BarraDeAbas'
import type { ContextoDaViagem } from './dados'
import type { Derivados } from './derivados'
import type { Registros } from './useRegistros'

interface Props {
  c: ContextoDaViagem
  d: Derivados
  r: Registros
  onAba: (aba: Aba, visao?: 'paradas' | 'timeline') => void
  onBackup: () => void
}

export function AbaViagem({ c, d, r, onAba, onBackup }: Props) {
  const { repo, plano, eventos, passageiros, agora, recarregar } = c
  const { locais } = plano
  const { s, nome, localDe, proxima, proximaEtapa, mapa, pendencia, concluida, estadoBackup, sugerirBackup, restaurada, ultima, cidadeDe, destino, destinoOriginal, nomeLocalParado, chegadaProxima, saidaOrigem, aBordo } = d
  const { abrir, ocupado, setErro, horaPendente, setHoraPendente, registrar } = r

  /** "Marcar quem desceu" no cartão da parada: marca ou corrige a qualquer momento. */
  function botaoMarcarDescida(local: 'etapa' | 'nao_planejada', etapaId: string) {
    if (passageiros.length === 0 || r.contextoDeDescida(local, etapaId).aBordo.length === 0) return null
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

  const nomeProxima = proximaEtapa ? nomeDaEtapa(proximaEtapa, locais) : ''
  const localProxima = localDe(proxima)?.nome ?? 'Local não escolhido'
  const nAlternativas = proximaEtapa?.tipo === 'flexivel' && !concluida ? proximaEtapa.alternativas.length : 0
  const origemDoDestino = destino
    ? (textoDaOrigemDaPrevisao(destino) ?? (destino.origem === 'relogio' ? 'Acompanhando o relógio' : destino.origem === 'real' ? 'Horário registrado' : 'Calculada pelo roteiro'))
    : null
  const seloAtraso = d.atraso !== null && <SeloDeAtraso minutos={d.atraso} />
  const cr = s.cronometro
  const progresso = cr && cr.planejadoMin > 0 ? Math.min(100, Math.round((cr.decorridoMin / cr.planejadoMin) * 100)) : cr ? 100 : 0

  return (
    <main className="conteudo viagem">
      <section className="cartao destaque" aria-label="Previsão no destino">
        <p className="destaque-rotulo">
          {concluida ? 'Chegada real em' : 'Chegada em'} {cidadeDe(ultima?.id)}
        </p>
        <p className="hora-grande">
          {destino ? <Hora instante={destino.instante} agora={agora} /> : <span className="sem-tempo">sem tempo definido</span>}
        </p>
        <p className="destaque-linha">
          {destinoOriginal && (
            <span>
              original <Hora instante={destinoOriginal} agora={agora} />
            </span>
          )}
          {seloAtraso}
        </p>
        {origemDoDestino && !concluida && <p className="destaque-origem">{origemDoDestino}</p>}
      </section>

      {concluida && (
        <section className="cartao" aria-label="Viagem encerrada">
          <h2>Viagem encerrada</h2>
          <p className="linha-grande">{textoDaSituacao(s.situacao, nomeLocalParado)}</p>
          <p className="linha">
            Original {destinoOriginal ? <Hora instante={destinoOriginal} agora={agora} /> : '—'} · real{' '}
            {destino ? <Hora instante={destino.instante} agora={agora} /> : '—'}
          </p>
        </section>
      )}

      {restaurada && (
        <section className="cartao atencao cartao-backup" aria-label="Viagem restaurada" data-teste="aviso-restaurada">
          <h2>Restaurada de um backup</h2>
          <p>Restaurada do backup de {dataHoraCurta(restaurada.geradoEm)}. O que aconteceu depois não está aqui: registre pela timeline.</p>
          <div className="duas-colunas">
            <button type="button" className="botao pequeno" onClick={() => onAba('roteiro', 'timeline')}>
              Timeline
            </button>
            <button type="button" className="botao pequeno" onClick={() => void repo.dispensarAvisoDeRestauracao().then(recarregar)}>
              Entendi
            </button>
          </div>
        </section>
      )}

      {s.situacao === 'aguardando_saida' && saidaOrigem && (
        <section className="cartao" aria-label="Saída">
          <h2>Aguardando saída</h2>
          <p className="linha-grande">
            Saída prevista <Hora instante={saidaOrigem.instante} agora={agora} />
            {saidaOrigem.atrasoMin !== null && saidaOrigem.atrasoMin !== 0 && (
              <span className="suave"> · {textoDoAtraso(saidaOrigem.atrasoMin)}</span>
            )}
          </p>
        </section>
      )}

      {cr && (
        <section className={`cartao ${cr.excedeuMin > 0 ? 'atencao' : ''}`} aria-label="Cronômetro da parada">
          <h2>Parados em {nome(s.etapaAtualId)}</h2>
          <p className="cronometro">{textoDoCronometroDeSaida(cr)}</p>
          <div className={`progresso${cr.excedeuMin > 0 ? ' estourou' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progresso} aria-label="Tempo da parada">
            <span style={{ width: `${progresso}%` }} />
          </div>
          <p className="dica">
            Planejado {formatarDuracaoCurta(cr.planejadoMin)} · decorrido {formatarDuracaoCurta(cr.decorridoMin)}
          </p>
          {botaoMarcarDescida('etapa', cr.etapaId)}
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
          <button type="button" className="botao" disabled={ocupado} onClick={() => abrir('volta')}>
            CHEGAMOS (sem registrar a volta antes)
          </button>
        </section>
      )}

      {proxima && proximaEtapa && !concluida && (
        <section className="cartao" aria-label="Próxima parada">
          <h2>Próxima parada</h2>
          <p className="linha-grande">{nomeProxima}</p>
          {localProxima !== nomeProxima && <p className="suave">{localProxima}</p>}
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
          {mapa && (
            <a className="link-texto" href={mapa} target="_blank" rel="noopener noreferrer">
              Abrir no Maps
            </a>
          )}
          {nAlternativas > 0 && (
            <button type="button" className="atalho" onClick={() => onAba('roteiro')}>
              {textoDoAtalhoDeAlternativas(nAlternativas)}
              <span aria-hidden="true"> ›</span>
            </button>
          )}
        </section>
      )}

      <div className="cartoes-pequenos">
        <button type="button" className="cartao pequeno" onClick={() => onAba('pessoas')} data-teste="cartao-a-bordo">
          <h2>{aBordo?.tipo === 'esperados' ? 'Esperados na saída' : 'A bordo'}</h2>
          <span className="valor">{aBordo ? textoABordo(aBordo) : passageiros.length === 0 ? 'Sem passageiros cadastrados' : '—'}</span>
        </button>
        {estadoBackup && (
          <button type="button" className={`cartao pequeno${estadoBackup.defasado ? ' atencao' : ''}`} onClick={onBackup} data-teste="linha-backup">
            <h2>Último backup</h2>
            <span className="valor">{linhaDoUltimoBackup(estadoBackup, agora).replace(/^Último backup: /, '')}</span>
          </button>
        )}
      </div>

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

      {pendencia && !concluida && (
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
              const ok = await registrar(() => repo.registrarPendencia(plano.viagem.id, pendencia.etapaId, pendencia.momento, quando), 'Horário registrado.')
              if (ok) setHoraPendente('')
            }}
          >
            Registrar horário
          </button>
        </section>
      )}
    </main>
  )
}
