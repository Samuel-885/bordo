// Aba "Mais": tudo o que não precisa estar à mão na tela principal, em três grupos.
// Comunicação, Registros e Dados e aparelho. Nenhuma regra: abre as mesmas folhas e telas.

import type { ReactNode } from 'react'
import { ordenarPor } from '../../core/tempo'
import { linhaDoUltimoBackup } from '../logica/backup'
import { formatarHora } from '../logica/horarios'
import { PREFERENCIAS, ROTULO_PREFERENCIA } from '../logica/tema'
import { useTema } from '../tema'
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

interface ItemProps {
  titulo: string
  detalhe?: string
  onClick?: () => void
  desligado?: boolean
  children?: ReactNode
}

function Item({ titulo, detalhe, onClick, desligado, children }: ItemProps) {
  return (
    <li>
      <button type="button" className="item-menu" onClick={onClick} disabled={desligado}>
        <span className="item-texto">
          <strong>{titulo}</strong>
          {detalhe && <span className="item-detalhe">{detalhe}</span>}
        </span>
        {!desligado && <span className="item-seta" aria-hidden="true">›</span>}
      </button>
      {children}
    </li>
  )
}

export function AbaMais({ c, d, r, onModelos, onBackup, onTrocarViagem, onAbrirDemo, onSairDaDemo }: Props) {
  const { eventos, agora } = c
  const demo = c.repo.espaco === 'demo'
  const { concluida, podeRecalibrar, podePular, estadoBackup } = d
  const { preferencia, definir } = useTema()

  const ultimaAtualizacao = ordenarPor(
    eventos.filter((e) => e.tipo === 'atualizacao_gerada'),
    (e) => e.horarioFato,
  ).at(-1)

  return (
    <main className="conteudo viagem">
      <section className="grupo-menu" aria-label="Comunicação">
        <h2>Comunicação</h2>
        <ul>
          <Item
            titulo="Mensagem de atualização"
            detalhe={concluida ? 'Viagem encerrada' : ultimaAtualizacao ? `última gerada às ${formatarHora(ultimaAtualizacao.horarioFato)}` : 'nenhuma gerada ainda'}
            desligado={concluida}
            onClick={() => { r.setErro(null); r.setPrevia(true) }}
          />
          <Item titulo="Modelos de mensagem" detalhe="texto da atualização e do restaurante" onClick={onModelos} />
        </ul>
      </section>

      <section className="grupo-menu" aria-label="Registros">
        <h2>Registros</h2>
        <ul>
          <Item titulo="Registrar imprevisto" desligado={concluida} onClick={() => r.abrir('imprevisto')} />
          <Item titulo="Observação" detalhe="fica só no celular" desligado={concluida} onClick={() => r.abrir('observacao')} />
          {podeRecalibrar && <Item titulo="Atualizar previsão" detalhe="com o horário do Google Maps" onClick={() => r.abrir('recalibracao')} />}
          {podePular && <Item titulo="Pular etapa" detalhe={d.proxima ? d.nome(d.proxima) : undefined} onClick={() => r.abrir('pular')} />}
          <Item titulo="Relatório" detalhe="chega na fase 10b" desligado />
        </ul>
      </section>

      <section className="grupo-menu" aria-label="Dados e aparelho">
        <h2>Dados e aparelho</h2>
        <ul>
          {!demo && (
            <Item
              titulo="Backup"
              detalhe={estadoBackup ? linhaDoUltimoBackup(estadoBackup, agora) : undefined}
              onClick={onBackup}
            />
          )}
          <li className="item-tema">
            <div className="item-texto">
              <strong id="rotulo-tema">Modo noite</strong>
              <span className="item-detalhe">automático das 18:00 às 06:00</span>
            </div>
            <div className="segmentos tres" role="radiogroup" aria-labelledby="rotulo-tema">
              {PREFERENCIAS.map((p) => (
                <button key={p} type="button" role="radio" aria-checked={preferencia === p} className="segmento" onClick={() => definir(p)}>
                  {ROTULO_PREFERENCIA[p]}
                </button>
              ))}
            </div>
          </li>
          <Item titulo="Trocar de viagem" detalhe="voltar à lista de viagens" onClick={onTrocarViagem} />
          {demo ? (
            <Item titulo="Sair da demonstração" detalhe="volta às viagens de verdade" onClick={onSairDaDemo} />
          ) : (
            <Item titulo="Demonstração" detalhe="relógio simulado e dados fictícios" onClick={onAbrirDemo} />
          )}
        </ul>
      </section>
    </main>
  )
}
