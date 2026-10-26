// Relatório da viagem (fase 10b): prévia na tela e PDF para compartilhar (WhatsApp, e-mail) ou
// baixar. Nenhuma regra aqui: o núcleo monta o relatório, `relatorioDocumento` escolhe os textos
// e `relatorioPdf` desenha. Por padrão sem nomes e sem observações; as duas opções são
// independentes e começam desligadas a cada vez que a tela abre. Funciona sem internet.

import { useEffect, useMemo, useState } from 'react'
import { montarRelatorio, type OpcoesDoRelatorio } from '../core/relatorio'
import { Topo } from './componentes/Topo'
import { baixarArquivo, compartilharArquivo, podeCompartilharArquivo } from './logica/backupArquivo'
import {
  AVISO_NOMES_NO_RELATORIO,
  AVISO_OBSERVACOES_NO_RELATORIO,
  AVISO_TEXTOS_LIVRES_NO_RELATORIO,
  montarDocumento,
  type Bloco,
} from './logica/relatorioDocumento'
import { gerarPdfDoRelatorio, TIPO_DO_PDF } from './logica/relatorioPdf'
import { useVoltarFecha } from './useVoltarFecha'
import type { ContextoDaViagem } from './viagem/dados'

interface Props {
  c: ContextoDaViagem
  onFechar: () => void
}

function BlocoNaTela({ bloco }: { bloco: Bloco }) {
  if (bloco.tipo === 'texto') return <p className={bloco.estilo === 'aviso' ? 'aviso' : bloco.estilo === 'dica' ? 'dica' : 'relatorio-texto'}>{bloco.texto}</p>
  if (bloco.tipo === 'lista') {
    return (
      <ul className="relatorio-lista">
        {bloco.itens.map((i, k) => (
          <li key={k}>{i}</li>
        ))}
      </ul>
    )
  }
  if (bloco.tipo === 'chaves') {
    return (
      <dl className="relatorio-chaves">
        {bloco.linhas.map(([rotulo, valor]) => (
          <div key={rotulo}>
            <dt>{rotulo}</dt>
            <dd className="mono">{valor}</dd>
          </div>
        ))}
      </dl>
    )
  }
  return (
    <div className="relatorio-tabela">
      <table>
        {bloco.colunas.some((x) => x !== '') && (
          <thead>
            <tr>
              {bloco.colunas.map((x, i) => (
                <th key={i} scope="col">
                  {x}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {bloco.linhas.map((l, i) => (
            <tr key={i}>
              {l.map((x, k) => (
                <td key={k} className={k === 0 ? undefined : 'mono'}>
                  {x}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Relatorio({ c, onFechar }: Props) {
  useVoltarFecha(true, onFechar)
  const [opcoes, setOpcoes] = useState<OpcoesDoRelatorio>({ incluirNomes: false, incluirObservacoes: false })
  const [ocupado, setOcupado] = useState(false)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [podeCompartilhar] = useState(() => podeCompartilharArquivo(new File([''], 'relatorio.pdf', { type: TIPO_DO_PDF })))

  // Baixa o pedaço do PDF já na abertura: o toque em COMPARTILHAR não espera o carregamento.
  useEffect(() => {
    void import('jspdf').catch(() => {})
  }, [])

  const { plano, eventos, passageiros, agora, backup } = c
  const documento = useMemo(() => {
    const relatorio = montarRelatorio(plano, eventos, passageiros, agora, backup?.restauradoDe ?? null, opcoes)
    return montarDocumento(relatorio, plano, eventos)
  }, [plano, eventos, passageiros, agora, backup, opcoes])

  async function entregar(como: 'compartilhar' | 'baixar') {
    setOcupado(true)
    setErro(null)
    setMensagem(null)
    try {
      const arquivo = await gerarPdfDoRelatorio(documento)
      if (como === 'compartilhar') {
        const r = await compartilharArquivo(arquivo, navigator, 'Relatório da viagem')
        if (r === 'cancelado') setMensagem('Compartilhamento cancelado.')
        else if (r === 'falhou') setErro('Não foi possível abrir o menu de compartilhar. Use BAIXAR PDF.')
        else setMensagem('PDF gerado e entregue ao menu de compartilhar. O app não sabe se o envio terminou; sem internet ele só sai quando houver sinal: confira se chegou.')
      } else {
        baixarArquivo(arquivo)
        setMensagem(`PDF gerado e baixado (${arquivo.name}). Procure em Downloads e envie para quem precisa.`)
      }
    } catch {
      setErro('Não foi possível gerar o PDF. Feche e abra o relatório de novo; se continuar, o app precisa ser aberto uma vez com internet para guardar o gerador de PDF.')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <>
      <Topo titulo="Relatório" onVoltar={onFechar} rotuloVoltar="Voltar à viagem" />
      <main className="conteudo relatorio" data-teste="relatorio">
        <section className="cartao relatorio-opcoes" aria-label="Gerar o PDF">
          <h2>Gerar o PDF</h2>
          {c.plano.viagem.status !== 'concluida' && <p className="aviso">Viagem em andamento: o relatório mostra só o que já aconteceu.</p>}
          <label className="opcao">
            <input type="checkbox" checked={opcoes.incluirNomes} onChange={(e) => setOpcoes({ ...opcoes, incluirNomes: e.target.checked })} />
            <span>Incluir nomes</span>
          </label>
          {opcoes.incluirNomes && <p className="aviso" data-teste="aviso-nomes">{AVISO_NOMES_NO_RELATORIO}</p>}
          <label className="opcao">
            <input type="checkbox" checked={opcoes.incluirObservacoes} onChange={(e) => setOpcoes({ ...opcoes, incluirObservacoes: e.target.checked })} />
            <span>Incluir observações</span>
          </label>
          {opcoes.incluirObservacoes && <p className="aviso" data-teste="aviso-observacoes">{AVISO_OBSERVACOES_NO_RELATORIO}</p>}
          <p className="dica">{AVISO_TEXTOS_LIVRES_NO_RELATORIO}</p>
          <div className="acoes">
            {podeCompartilhar && (
              <button type="button" className="botao principal largo" disabled={ocupado} onClick={() => void entregar('compartilhar')}>
                COMPARTILHAR PDF
              </button>
            )}
            <button type="button" className={`botao largo${podeCompartilhar ? '' : ' principal'}`} disabled={ocupado} onClick={() => void entregar('baixar')}>
              BAIXAR PDF
            </button>
          </div>
          {mensagem && <p className="dica" role="status">{mensagem}</p>}
          {erro && <p className="msg-erro" role="alert">{erro}</p>}
        </section>

        <article className="cartao relatorio-previa" aria-label="Prévia do relatório">
          <h2 className="relatorio-titulo">{documento.titulo}</h2>
          <dl className="relatorio-chaves">
            {documento.cabecalho.map(([rotulo, valor]) => (
              <div key={rotulo}>
                <dt>{rotulo}</dt>
                <dd>{valor}</dd>
              </div>
            ))}
          </dl>
          {documento.avisos.map((a, i) => (
            <p key={i} className="aviso">{a}</p>
          ))}
          {documento.secoes.map((s) => (
            <section key={s.id} aria-label={s.titulo} data-teste={`relatorio-${s.id}`}>
              <h3>{s.titulo}</h3>
              {s.blocos.map((b, i) => (
                <BlocoNaTela key={i} bloco={b} />
              ))}
            </section>
          ))}
        </article>
      </main>
    </>
  )
}
