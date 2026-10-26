// Roteiro, visão "Paradas": lista vertical com marcador (feita, estamos aqui, próxima, futura),
// horário real ou previsto em mono e o atraso. Sob a próxima parada flexível ficam as
// alternativas abertas, com a classificação e a margem. Nenhuma regra: tudo vem do núcleo.

import { classificarAtraso } from '../../core/atraso'
import { inclusaoDaEtapa } from '../../core/inclusao'
import type { Consulta, HorarioPrevisto } from '../../core/tipos'
import { Hora } from '../componentes/Hora'
import { rotuloDaClasse, textoDaMargem, textoDoImpacto } from '../logica/alternativas'
import { formatarHora } from '../logica/horarios'
import { nomeDaEtapa } from '../logica/textos'
import { textoDoAtraso } from '../logica/textosViagem'
import type { ContextoDaViagem } from './dados'
import type { Derivados } from './derivados'
import { alternativasDaProxima, marcadorDa, ROTULO_MARCADOR } from './marcadores'
import type { Registros } from './useRegistros'

interface Props {
  c: ContextoDaViagem
  d: Derivados
  r: Registros
  consultas: Consulta[]
  onAlternativas: () => void
}

export function ListaDeParadas({ c, d, r, consultas, onAlternativas }: Props) {
  const { plano, eventos, agora } = c
  const { locais } = plano
  const { etapa: proximaFlexivel, avaliacoes } = alternativasDaProxima(c, d, consultas)

  return (
    <>
    <ol className="paradas" aria-label="Paradas da viagem">
      {d.ordenadas.map((etapa) => {
        const estado = d.estadoDe(etapa.id)
        const marcador = marcadorDa(estado, etapa, d)
        // Na origem vale a saída; nas demais, a chegada (real ou prevista).
        const horario: HorarioPrevisto | null = (etapa.tipo === 'origem' ? estado?.saida : estado?.chegada) ?? null
        const classe = horario?.atrasoMin == null ? null : classificarAtraso(horario.atrasoMin)
        const local = d.localDe(etapa.id)?.nome
        const titulo = nomeDaEtapa(etapa, locais)
        return (
          <li key={etapa.id} className={`parada ${marcador}`} data-teste="parada" data-marcador={marcador}>
            <span className="parada-marca" aria-hidden="true" />
            <div className="parada-corpo">
              <div className="parada-linha">
                <p className={`parada-nome${marcador === 'pulada' ? ' riscado' : ''}`}>{titulo}</p>
                {horario && marcador !== 'pulada' && (
                  <span className="parada-hora">
                    <Hora instante={horario.instante} agora={agora} />
                  </span>
                )}
              </div>
              <p className="parada-detalhe">
                <span className={`parada-estado ${marcador}`}>{ROTULO_MARCADOR[marcador]}</span>
                {inclusaoDaEtapa(eventos, etapa.id) && <span className="aviso-chip" data-teste="parada-incluida"> · incluída, sem original</span>}
                {local && local !== titulo && <span> · {local}</span>}
                {horario && marcador !== 'pulada' && (
                  <span>
                    {' '}
                    · {etapa.tipo === 'origem' ? 'saída' : 'chegada'} {horario.origem === 'real' ? 'real' : 'prevista'}
                  </span>
                )}
                {classe && marcador !== 'pulada' && (
                  <span className={`parada-atraso ${classe.situacao}`}> · {textoDoAtraso(classe.minutos)}</span>
                )}
              </p>
              {inclusaoDaEtapa(eventos, etapa.id) && estado?.estado === 'pendente' && (
                <button
                  type="button"
                  className="atalho"
                  data-teste="cancelar-inclusao"
                  onClick={() => { r.setErro(null); r.setCancelando({ eventoId: inclusaoDaEtapa(eventos, etapa.id)!.id, nome: local ?? titulo }) }}
                >
                  Cancelar parada incluída
                </button>
              )}
              {proximaFlexivel?.id === etapa.id && avaliacoes.length > 0 && (
                <div className="parada-alternativas" aria-label={`Alternativas de ${titulo}`}>
                  <ul>
                    {avaliacoes.map((a) => (
                      <li key={a.localId} className={a.escolhida ? 'escolhida' : undefined} data-teste="alternativa-resumo">
                        <span className="alt-nome">{locais.find((l) => l.id === a.localId)?.nome ?? 'Local'}</span>
                        <span className={`classe classe-${a.classe}`}>{rotuloDaClasse(a.classe)}</span>
                        <span className="alt-detalhe">
                          {a.chegada ? `chega ${formatarHora(a.chegada)}` : 'sem tempo'}
                          {a.margemMin !== null && ` · ${textoDaMargem(a.margemMin)}`}
                          {a.impactoDestinoMin !== null && !a.escolhida && ` · destino ${textoDoImpacto(a.impactoDestinoMin)}`}
                          {a.escolhida && ' · escolhida'}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <button type="button" className="atalho" onClick={onAlternativas}>
                    Comparar e escolher<span aria-hidden="true"> ›</span>
                  </button>
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ol>
      {d.podeIncluir && (
        <button type="button" className="botao largo" data-teste="incluir-parada" onClick={() => { r.setErro(null); r.setMudanca({ tipo: 'incluir', apos: '' }) }}>
          + Incluir parada
        </button>
      )}
    </>
  )
}
