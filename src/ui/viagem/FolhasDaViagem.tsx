// Folhas e avisos que sobem de baixo na viagem: quem desceu, mensagem, observação, parada,
// imprevisto, previsão, volta, pular e o aviso com DESFAZER. Valem em qualquer aba.

import type { Instante, TipoImprevisto } from '../../core/tipos'
import { marcacaoDeDescida } from '../../core/conferencia'
import { AvisoDesfazer } from '../componentes/AvisoDesfazer'
import { Confirmar } from '../componentes/Confirmar'
import { FolhaDadosDaViagem } from '../componentes/FolhaDadosDaViagem'
import { FolhaMensagem } from '../componentes/FolhaMensagem'
import { FolhaQuemDesceu } from '../FolhaQuemDesceu'
import { FolhaAjusteDaParada, FolhaHorario, FolhaImprevisto, FolhaObservacao, FolhaParada, FolhaRecalibracao, type DadosDaParada } from '../Folhas'
import { formatarHora } from '../logica/horarios'
import { gerarMensagem, valoresDaAtualizacao } from '../logica/mensagens'
import type { ContextoDaViagem } from './dados'
import type { Derivados } from './derivados'
import type { Registros } from './useRegistros'

interface Props {
  c: ContextoDaViagem
  d: Derivados
  r: Registros
  onModelos: () => void
}

export function FolhasDaViagem({ c, d, r, onModelos }: Props) {
  const { repo, plano, eventos, passageiros, modelos, agora } = c
  const { viagem } = plano
  const { s, proxima, mapa, nome, podeRecalibrar } = d
  const { acao, ocupado, erro } = r

  return (
    <>
      {r.desfazer && <AvisoDesfazer texto={r.desfazer.texto} onDesfazer={() => void r.desfazerUltimo()} />}

      {r.descida && (
        <FolhaQuemDesceu
          key={`${r.descida.local}-${r.descida.etapaId}`}
          aBordo={r.contextoDeDescida(r.descida.local, r.descida.etapaId).aBordo}
          atual={marcacaoDeDescida(eventos, r.descida.local, r.descida.etapaId)}
          automatica={r.descida.automatica}
          ocupado={ocupado}
          erro={erro}
          onSalvar={(ids) => void r.salvarDescida(ids)}
          onFechar={() => r.setDescida(null)}
        />
      )}

      {r.previa && (
        <FolhaMensagem
          titulo="Mensagem de atualização"
          gerar={() => gerarMensagem('atualizacao', modelos.atualizacao, valoresDaAtualizacao(plano, eventos, passageiros, agora))}
          chave={`${viagem.identificacao ?? ''}|${viagem.equipe ?? 0}`}
          aoUsar={r.registrarAtualizacaoGerada}
          onEditarModelo={() => { r.setPrevia(false); onModelos() }}
          onDados={() => { r.setErro(null); r.setDadosAbertos(true) }}
          onFechar={() => r.setPrevia(false)}
        />
      )}

      {r.dadosAbertos && (
        <FolhaDadosDaViagem
          viagem={viagem}
          ocupado={ocupado}
          erro={erro}
          onSalvar={(dados) => void r.salvarDados(dados)}
          onCancelar={() => { r.setErro(null); r.setDadosAbertos(false) }}
        />
      )}

      {acao === 'observacao' && (
        <FolhaObservacao
          aberta
          ocupado={ocupado}
          erro={erro}
          agora={agora}
          onCancelar={r.fechar}
          onConfirmar={async ({ horario, texto }) => {
            const ok = await r.registrarConteudo({ tipo: 'observacao', dados: { texto } }, 'Observação registrada.', { horarioFato: horario })
            if (ok) r.fechar()
          }}
        />
      )}

      {acao === 'parada' && proxima && (
        <FolhaParada
          aberta
          ocupado={ocupado}
          erro={erro}
          onCancelar={r.fechar}
          onConfirmar={async (dados: DadosDaParada) => {
            const ok = await r.registrarConteudo(
              { tipo: 'parada_nao_planejada', etapaId: proxima, dados: { fase: 'inicio', ...dados } },
              `PARAMOS registrado às ${formatarHora(agora)}.`,
            )
            if (ok) {
              r.fechar()
              r.oferecerDescida('nao_planejada', proxima)
            }
          }}
        />
      )}

      {acao === 'ajuste_parada' && s.paradaNaoPlanejada && (
        <FolhaAjusteDaParada
          aberta
          ocupado={ocupado}
          erro={erro}
          inicial={{ onde: s.paradaNaoPlanejada.onde, tempoPrevistoMin: s.paradaNaoPlanejada.tempoPrevistoMin }}
          onCancelar={r.fechar}
          onConfirmar={async (dados) => {
            const etapaId = s.paradaNaoPlanejada!.etapaId
            const ok = await r.registrarConteudo({ tipo: 'parada_nao_planejada', etapaId, dados: { fase: 'previsao', ...dados } }, 'Parada ajustada.')
            if (ok) r.fechar()
          }}
        />
      )}

      {acao === 'imprevisto' && (
        <FolhaImprevisto
          aberta
          ocupado={ocupado}
          erro={erro}
          agora={agora}
          emViagem={s.situacao === 'em_viagem'}
          onUsarParamos={() => r.abrir('parada')}
          onCancelar={r.fechar}
          onConfirmar={async ({ horario, categoria, observacao }: { horario: Instante; categoria: TipoImprevisto; observacao: string }) => {
            const ok = await r.registrarConteudo({ tipo: 'imprevisto', dados: { categoria } }, 'Imprevisto registrado.', {
              horarioFato: horario,
              ...(observacao ? { observacao } : {}),
            })
            if (ok) r.setAcao(podeRecalibrar ? 'oferta' : null)
          }}
        />
      )}

      <Confirmar
        aberto={acao === 'oferta'}
        titulo="Imprevisto registrado"
        rotuloConfirmar="ATUALIZAR PREVISÃO"
        onConfirmar={() => r.abrir('recalibracao')}
        onCancelar={r.fechar}
      >
        <p>Quer atualizar a previsão com o horário do Google Maps?</p>
      </Confirmar>

      {acao === 'recalibracao' && proxima && (
        <FolhaRecalibracao
          aberta
          ocupado={ocupado}
          erro={erro}
          agora={agora}
          linkMapa={mapa}
          nomeEtapa={nome(proxima)}
          onCancelar={r.fechar}
          onConfirmar={async (horario: Instante) => {
            const ok = await r.registrarConteudo(
              { tipo: 'recalibracao', etapaId: proxima, dados: { horario } },
              `Previsão atualizada para ${formatarHora(horario)}.`,
            )
            if (ok) r.fechar()
          }}
        />
      )}

      {acao === 'volta' && proxima && (
        <FolhaHorario
          aberta
          ocupado={ocupado}
          erro={erro}
          agora={agora}
          titulo="A que horas voltamos à estrada?"
          rotulo="Horário do VOLTAMOS"
          inicial=""
          dica="A parada não planejada foi registrada e ficou aberta. O VOLTAMOS será gravado antes da chegada."
          onCancelar={r.fechar}
          onConfirmar={async (retornoEm: Instante) => {
            const ok = await r.registrar(
              () => repo.registrarChegada(viagem.id, proxima, { retornoEm }),
              `Chegada registrada às ${formatarHora(agora)}.`,
            )
            if (ok) {
              r.fechar()
              r.oferecerDescida('etapa', proxima)
            }
          }}
        />
      )}

      <Confirmar
        aberto={r.cancelando !== null}
        titulo="Cancelar parada incluída?"
        rotuloConfirmar="Cancelar parada"
        perigo
        onConfirmar={() => void r.cancelarInclusao()}
        onCancelar={() => { r.setErro(null); r.setCancelando(null) }}
      >
        <p>
          {r.cancelando?.nome ?? 'A parada'} deixa de existir no percurso e a previsão volta ao cálculo sem ela. Só vale antes de chegar
          nela. Dá para desfazer logo depois.
        </p>
        {erro && r.cancelando && <p className="msg-erro">{erro}</p>}
      </Confirmar>

      <Confirmar
        aberto={acao === 'pular'}
        titulo="Pular etapa?"
        rotuloConfirmar="Pular"
        perigo
        onConfirmar={async () => {
          if (!proxima) return
          const ok = await r.registrarConteudo({ tipo: 'pular_etapa', etapaId: proxima }, `${nome(proxima)} pulada.`)
          if (ok) r.fechar()
        }}
        onCancelar={r.fechar}
      >
        <p>
          {proxima ? nome(proxima) : 'A etapa'} sai do percurso e a previsão é recalculada. Dá para desfazer logo depois.
        </p>
        {erro && acao === 'pular' && <p className="msg-erro">{erro}</p>}
      </Confirmar>
    </>
  )
}
