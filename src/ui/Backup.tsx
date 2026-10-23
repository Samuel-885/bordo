// Backup e restauração (fase 10a). Gerar: aviso de privacidade, compartilhar ou baixar. Restaurar:
// escolher o arquivo, validar, mostrar o resumo e só então confirmar. Por padrão "juntar por
// viagem" (cada viagem marcada substitui a de mesmo id; as outras ficam); "substituir tudo" é a
// opção avançada. Nenhuma regra aqui: validação, resumo e comparação vêm do núcleo.

import { useRef, useState } from 'react'
import { avaliarViagensDoArquivo, estadoDoBackup, resumirBackup, validarBackup, type AvaliacaoViagem, type Backup as ArquivoDeBackup, type ResumoViagem } from '../core/backup'
import type { Viagem } from '../core/tipos'
import { mensagemDeErroDoBanco } from '../data/avisoBanco'
import type { Repositorio } from '../data/repositorio'
import { AcoesDeBackup } from './componentes/AcoesDeBackup'
import { Confirmar } from './componentes/Confirmar'
import { Topo } from './componentes/Topo'
import { dataHoraBr, linhaDoUltimoBackup, textoDoEstadoDaViagem } from './logica/backup'
import { lerArquivoEscolhido } from './logica/backupArquivo'
import { formatarData } from './logica/horarios'
import { avisarMudanca, useAgora } from './useAgora'
import { useDados } from './useDados'

interface Props {
  repo: Repositorio
  onVoltar: () => void
  onAbrirViagem: (viagem: Viagem) => void
}

export function Backup({ repo, onVoltar, onAbrirViagem }: Props) {
  const { dados, erro, recarregar } = useDados(async () => {
    const [ultimo, total, viagensDoCelular] = await Promise.all([repo.obterUltimoBackup(), repo.contarEventos(), repo.resumirViagensDoCelular()])
    return { ultimo, total, viagensDoCelular }
  }, `backup:${repo.espaco}`)
  const agora = useAgora()

  return (
    <>
      <Topo titulo="Backup" onVoltar={onVoltar} rotuloVoltar="Voltar às viagens" />
      <main className="conteudo">
        {erro && <p className="msg-erro">{erro}</p>}
        {dados && (
          <>
            <section className="cartao">
              <h2>Último backup</h2>
              <p className="mono" data-teste="ultimo-backup">{linhaDoUltimoBackup(estadoDoBackup(dados.ultimo, dados.total, agora), agora)}</p>
              <p className="dica">Guarda tudo: viagens, etapas, locais, trechos, registros, passageiros e modelos de mensagem. Funciona sem internet; só o envio espera o sinal.</p>
            </section>
            <section className="cartao">
              <h2>Gerar backup</h2>
              <AcoesDeBackup repo={repo} aoEntregar={recarregar} />
            </section>
            <Restaurar repo={repo} viagensDoCelular={dados.viagensDoCelular} onRestaurado={recarregar} onAbrirViagem={onAbrirViagem} onVoltar={onVoltar} />
          </>
        )}
      </main>
    </>
  )
}

interface ArquivoLido {
  nome: string
  backup: ArquivoDeBackup
  avaliacoes: AvaliacaoViagem[]
}

function descricaoDaViagem(v: ResumoViagem): string {
  const [a, m, d] = formatarData(v.dataSaida).split('-')
  const ultimo = v.ultimoEventoEm ? ` · último registro ${dataHoraBr(v.ultimoEventoEm)}` : ''
  return `${v.tipo === 'ida' ? 'Ida' : 'Volta'} · ${d}/${m}/${a} · ${textoDoEstadoDaViagem(v.status)} · ${v.eventos} registros · ${v.passageiros} passageiros${ultimo}`
}

function Restaurar({
  repo,
  viagensDoCelular,
  onRestaurado,
  onAbrirViagem,
  onVoltar,
}: {
  repo: Repositorio
  viagensDoCelular: ResumoViagem[]
  onRestaurado: () => void
  onAbrirViagem: (viagem: Viagem) => void
  onVoltar: () => void
}) {
  const entrada = useRef<HTMLInputElement>(null)
  const [lido, setLido] = useState<ArquivoLido | null>(null)
  const [escolhidas, setEscolhidas] = useState<Set<string>>(new Set())
  const [problema, setProblema] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [confirmar, setConfirmar] = useState<'juntar' | 'tudo' | null>(null)
  const [entendi, setEntendi] = useState(false)
  const [feito, setFeito] = useState<{ viagens: Viagem[] } | null>(null)

  async function escolher(arquivo: File | undefined) {
    setProblema(null)
    setLido(null)
    setFeito(null)
    setEntendi(false)
    if (!arquivo) return
    setOcupado(true)
    try {
      const r = await validarBackup(await lerArquivoEscolhido(arquivo))
      if (!r.ok) {
        setProblema(r.motivo)
        return
      }
      const avaliacoes = avaliarViagensDoArquivo(resumirBackup(r.backup).viagens, viagensDoCelular)
      setLido({ nome: arquivo.name, backup: r.backup, avaliacoes })
      setEscolhidas(new Set(avaliacoes.filter((a) => a.marcadaPorPadrao).map((a) => a.viagem.id)))
    } catch (x) {
      setProblema(x instanceof Error ? x.message : 'Não foi possível ler o arquivo.')
    } finally {
      setOcupado(false)
      if (entrada.current) entrada.current.value = ''
    }
  }

  async function restaurar(modo: 'juntar' | 'tudo') {
    if (!lido) return
    setConfirmar(null)
    setOcupado(true)
    setProblema(null)
    try {
      const r = await repo.restaurarBackup(lido.backup, modo === 'tudo' ? { modo: 'substituir_tudo' } : { modo: 'juntar', viagemIds: [...escolhidas] })
      if (!r.ok) {
        setProblema(r.motivo)
        return
      }
      const viagens = (await repo.listarViagens()).filter((v) => r.viagemIds.includes(v.id))
      setFeito({ viagens })
      setLido(null)
      avisarMudanca()
      onRestaurado()
    } catch (x) {
      setProblema(mensagemDeErroDoBanco(x, 'Não foi possível restaurar. Nada foi alterado no celular.'))
    } finally {
      setOcupado(false)
    }
  }

  const resumo = lido ? resumirBackup(lido.backup) : null
  const registrosDoCelular = viagensDoCelular.reduce((n, v) => n + v.eventos, 0)
  const perdidos = lido ? lido.avaliacoes.filter((a) => escolhidas.has(a.viagem.id)).reduce((n, a) => n + a.eventosAMaisNoCelular, 0) : 0
  const substituidas = lido ? lido.avaliacoes.filter((a) => escolhidas.has(a.viagem.id) && a.existeNoCelular).length : 0

  return (
    <section className="cartao">
      <h2>Restaurar de um arquivo</h2>
      <p className="dica">Para continuar a viagem em outro celular, ou se este perdeu os dados. Aceita arquivos .txt e .json do Bordo.</p>
      <div className="campo">
        <label htmlFor="arquivo-backup">Arquivo de backup</label>
        <input id="arquivo-backup" ref={entrada} type="file" accept=".txt,.json,text/plain,application/json" disabled={ocupado} onChange={(e) => void escolher(e.target.files?.[0])} />
      </div>
      {problema && <p className="msg-erro" role="alert">{problema}</p>}

      {feito && (
        <div className="aviso" role="status" data-teste="restaurado">
          <h3>Backup restaurado</h3>
          <p className="dica">
            {feito.viagens.length === 1 ? 'Viagem' : 'Viagens'}: {feito.viagens.map((v) => v.nome || 'Sem nome').join(', ')}. O que aconteceu depois do backup não está no app: registre pela timeline.
          </p>
          <div className="acoes">
            {feito.viagens
              .filter((v) => v.status === 'em_andamento')
              .map((v) => (
                <button key={v.id} type="button" className="botao principal largo" onClick={() => onAbrirViagem(v)}>
                  Abrir {v.nome || 'viagem'}
                </button>
              ))}
            <button type="button" className="botao largo" onClick={onVoltar}>
              Voltar às viagens
            </button>
          </div>
        </div>
      )}

      {lido && resumo && (
        <div className="resumo-backup" data-teste="resumo-backup">
          <p>
            <strong>Backup de {dataHoraBr(resumo.geradoEm)}</strong>
            <br />
            {resumo.viagens.length} {resumo.viagens.length === 1 ? 'viagem' : 'viagens'} · {resumo.eventos} registros · {resumo.passageiros} passageiros · {resumo.locais} locais · {resumo.modelos} modelos
          </p>
          <fieldset className="opcoes">
            <legend>Viagens a restaurar</legend>
            {lido.avaliacoes.map((a) => (
              <div key={a.viagem.id}>
                <label className="opcao">
                  <input
                    type="checkbox"
                    checked={escolhidas.has(a.viagem.id)}
                    onChange={(e) => {
                      const novas = new Set(escolhidas)
                      if (e.target.checked) novas.add(a.viagem.id)
                      else novas.delete(a.viagem.id)
                      setEscolhidas(novas)
                    }}
                  />
                  <span>
                    <strong>{a.viagem.nome || 'Sem nome'}</strong>
                    <br />
                    <span className="dica">{descricaoDaViagem(a.viagem)}</span>
                  </span>
                </label>
                {a.existeNoCelular && !a.celularMaisNovo && <p className="dica">Já existe no celular: será substituída (sem perder registros).</p>}
                {a.celularMaisNovo && (
                  <p className="msg-erro">
                    {a.eventosAMaisNoCelular > 0
                      ? `O celular tem ${a.eventosAMaisNoCelular} registros a mais; restaurar apaga esses registros.`
                      : 'O celular tem registros mais recentes que o arquivo; restaurar apaga esses registros.'}
                  </p>
                )}
              </div>
            ))}
          </fieldset>
          {viagensDoCelular.length > 0 ? (
            <div>
              <p className="dica">Antes de restaurar, guarde o que está no celular agora, se quiser poder voltar atrás.</p>
              <AcoesDeBackup repo={repo} aoEntregar={onRestaurado} />
            </div>
          ) : (
            <p className="dica">Não há viagens no celular: nada será substituído.</p>
          )}
          <button type="button" className="botao principal largo" disabled={ocupado || escolhidas.size === 0} onClick={() => setConfirmar('juntar')}>
            RESTAURAR VIAGENS ESCOLHIDAS
          </button>
          <details className="avancado">
            <summary>Opção avançada: substituir tudo</summary>
            <p className="dica">
              Apaga tudo o que está no celular ({viagensDoCelular.length} {viagensDoCelular.length === 1 ? 'viagem' : 'viagens'}, {registrosDoCelular} registros, locais e modelos) e deixa só o conteúdo do arquivo.
            </p>
            <label className="opcao">
              <input type="checkbox" checked={entendi} onChange={(e) => setEntendi(e.target.checked)} />
              <span>Entendo que o que está no celular será perdido.</span>
            </label>
            <button type="button" className="botao perigo largo" disabled={ocupado || !entendi} onClick={() => setConfirmar('tudo')}>
              SUBSTITUIR TUDO
            </button>
          </details>
        </div>
      )}

      <Confirmar
        aberto={confirmar === 'juntar'}
        titulo="Restaurar as viagens escolhidas?"
        rotuloConfirmar="Restaurar"
        perigo={perdidos > 0}
        onCancelar={() => setConfirmar(null)}
        onConfirmar={() => void restaurar('juntar')}
      >
        <p>
          {escolhidas.size} {escolhidas.size === 1 ? 'viagem será restaurada' : 'viagens serão restauradas'}
          {substituidas > 0 ? `; ${substituidas} já ${substituidas === 1 ? 'existe' : 'existem'} no celular e ${substituidas === 1 ? 'será substituída' : 'serão substituídas'}` : ''}.
          {perdidos > 0 ? ` Isso apaga ${perdidos} registros que só o celular tem.` : ''} As outras viagens do celular não mudam.
        </p>
      </Confirmar>
      <Confirmar
        aberto={confirmar === 'tudo'}
        titulo="Substituir tudo?"
        perigo
        rotuloConfirmar="Substituir tudo"
        onCancelar={() => setConfirmar(null)}
        onConfirmar={() => void restaurar('tudo')}
      >
        <p>
          Tudo o que está no celular ({viagensDoCelular.length} {viagensDoCelular.length === 1 ? 'viagem' : 'viagens'}, {registrosDoCelular} registros) será apagado e substituído pelo backup de {resumo ? dataHoraBr(resumo.geradoEm) : ''}.
        </p>
      </Confirmar>
    </section>
  )
}
