// Aba "Mais": tudo o que não precisa estar à mão na tela principal, em três grupos.
// Comunicação, Registros e Dados e aparelho. Nenhuma regra: abre as mesmas folhas e telas.

import { ordenarPor } from '../../core/tempo'
import { linhaDoUltimoBackup } from '../logica/backup'
import { formatarHora } from '../logica/horarios'
import { GrupoDadosEAparelho, GrupoDeMenu, ItemDeMenu as Item } from '../componentes/MenuMais'
import type { ContextoDaViagem } from './dados'
import type { Derivados } from './derivados'
import type { Registros } from './useRegistros'

interface Props {
  c: ContextoDaViagem
  d: Derivados
  r: Registros
  onModelos: () => void
  onBackup: () => void
  onTrocarViagem: () => void
  onAbrirDemo: () => void
  onSairDaDemo: () => void
}

export function AbaMais({ c, d, r, onModelos, onBackup, onTrocarViagem, onAbrirDemo, onSairDaDemo }: Props) {
  const { eventos, agora } = c
  const demo = c.repo.espaco === 'demo'
  const { concluida, podeRecalibrar, podePular, estadoBackup } = d

  const ultimaAtualizacao = ordenarPor(
    eventos.filter((e) => e.tipo === 'atualizacao_gerada'),
    (e) => e.horarioFato,
  ).at(-1)

  return (
    <main className="conteudo viagem">
      <GrupoDeMenu titulo="Comunicação">
        <Item
          titulo="Mensagem de atualização"
          detalhe={concluida ? 'Viagem encerrada' : ultimaAtualizacao ? `última gerada às ${formatarHora(ultimaAtualizacao.horarioFato)}` : 'nenhuma gerada ainda'}
          desligado={concluida}
          onClick={() => { r.setErro(null); r.setPrevia(true) }}
        />
        <Item titulo="Modelos de mensagem" detalhe="texto da atualização e do restaurante" onClick={onModelos} />
      </GrupoDeMenu>

      <GrupoDeMenu titulo="Registros">
        <Item titulo="Registrar imprevisto" desligado={concluida} onClick={() => r.abrir('imprevisto')} />
        <Item titulo="Observação" detalhe="fica só no celular" desligado={concluida} onClick={() => r.abrir('observacao')} />
        {podeRecalibrar && <Item titulo="Atualizar previsão" detalhe="com o horário do Google Maps" onClick={() => r.abrir('recalibracao')} />}
        {podePular && <Item titulo="Pular etapa" detalhe={d.proxima ? d.nome(d.proxima) : undefined} onClick={() => r.abrir('pular')} />}
        <Item titulo="Relatório" detalhe="chega na fase 10b" desligado />
      </GrupoDeMenu>

      <GrupoDadosEAparelho
        demo={demo}
        detalheDoBackup={estadoBackup ? linhaDoUltimoBackup(estadoBackup, agora) : undefined}
        onBackup={onBackup}
        onTrocarViagem={onTrocarViagem}
        onAbrirDemo={onAbrirDemo}
        onSairDaDemo={onSairDaDemo}
      />
    </main>
  )
}
