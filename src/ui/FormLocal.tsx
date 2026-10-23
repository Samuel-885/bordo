import { useState } from 'react'
import type { Local } from '../core/tipos'
import { novoId } from '../data/repositorio'
import { formularioDoLocal, formularioLocalVazio, localDoFormulario, validarLocal, type ErrosLocal, type FormLocal as Form } from './logica/formLocal'
import { ONIBUS_PARA, TIPOS_DE_LOCAL } from './logica/rotulos'
import { Topo } from './componentes/Topo'
import { mensagemDeErroDoBanco } from '../data/avisoBanco'

interface Props {
  /** O local a editar; vazio = novo local. */
  inicial?: Local
  onSalvar: (local: Local) => Promise<void>
  onCancelar: () => void
}

export function FormLocal({ inicial, onSalvar, onCancelar }: Props) {
  const [f, setF] = useState<Form>(() => (inicial ? formularioDoLocal(inicial) : formularioLocalVazio()))
  const [erros, setErros] = useState<ErrosLocal>({})
  const [falha, setFalha] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const muda = <K extends keyof Form>(campo: K, valor: Form[K]) => setF((atual) => ({ ...atual, [campo]: valor }))

  async function salvar() {
    const e = validarLocal(f)
    setErros(e)
    if (Object.keys(e).length > 0) return
    setSalvando(true)
    try {
      await onSalvar(localDoFormulario(f, inicial?.id ?? novoId(), inicial))
    } catch (x) {
      setFalha(mensagemDeErroDoBanco(x, 'Não foi possível salvar o local.'))
      setSalvando(false)
    }
  }

  return (
    <>
      <Topo titulo={inicial ? 'Editar local' : 'Novo local'} onVoltar={onCancelar} />
      <main className="conteudo">
        <section className="cartao">
          <div className={`campo ${erros.nome ? 'erro' : ''}`}>
            <label htmlFor="l-nome">Nome</label>
            <input id="l-nome" value={f.nome} onChange={(e) => muda('nome', e.target.value)} autoComplete="off" />
            {erros.nome && <p className="msg-erro">{erros.nome}</p>}
          </div>
          <div className={`campo ${erros.cidade ? 'erro' : ''}`}>
            <label htmlFor="l-cidade">Cidade</label>
            <input id="l-cidade" value={f.cidade} onChange={(e) => muda('cidade', e.target.value)} autoComplete="off" />
            {erros.cidade && <p className="msg-erro">{erros.cidade}</p>}
          </div>
          <div className="campo">
            <label htmlFor="l-tipo">Tipo</label>
            <select id="l-tipo" value={f.tipo} onChange={(e) => muda('tipo', e.target.value)}>
              {TIPOS_DE_LOCAL.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.rotulo}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="cartao">
          <div className={`campo ${erros.coordenadas ? 'erro' : ''}`}>
            <label htmlFor="l-coord">Coordenadas (opcional)</label>
            <input
              id="l-coord"
              className="mono"
              inputMode="decimal"
              placeholder="-19.4687, -42.5367"
              value={f.coordenadas}
              onChange={(e) => muda('coordenadas', e.target.value)}
              autoComplete="off"
            />
            {erros.coordenadas && <p className="msg-erro">{erros.coordenadas}</p>}
            <p className="dica">No Google Maps, segure o dedo sobre o local, toque nos números que aparecem e cole aqui.</p>
            {!f.coordenadas.trim() && (
              <p className="dica">
                <strong>Sem coordenadas não há rota automática</strong> até este local: o tempo do trecho terá de ser digitado.
              </p>
            )}
          </div>
        </section>

        <section className="cartao">
          <div className="linha-campos">
            <div className="campo">
              <label htmlFor="l-abre">Abre</label>
              <input id="l-abre" type="time" value={f.abre} onChange={(e) => muda('abre', e.target.value)} />
            </div>
            <div className="campo">
              <label htmlFor="l-fecha">Fecha</label>
              <input id="l-fecha" type="time" value={f.fecha} onChange={(e) => muda('fecha', e.target.value)} />
            </div>
          </div>
          {erros.horario && <p className="msg-erro">{erros.horario}</p>}
          <p className="dica">Confirme o horário por telefone: o do Google Maps pode estar desatualizado.</p>
        </section>

        <section className="cartao">
          <div className="campo">
            <label htmlFor="l-tel">Telefone (opcional)</label>
            <input id="l-tel" type="tel" value={f.telefone} onChange={(e) => muda('telefone', e.target.value)} autoComplete="off" />
          </div>
          <div className="campo">
            <label htmlFor="l-onibus">O ônibus consegue parar?</label>
            <select id="l-onibus" value={f.onibusPara} onChange={(e) => muda('onibusPara', e.target.value as Form['onibusPara'])}>
              {ONIBUS_PARA.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.rotulo}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="l-obs">Observações</label>
            <textarea id="l-obs" value={f.observacoes} onChange={(e) => muda('observacoes', e.target.value)} />
          </div>
        </section>

        {falha && <p className="msg-erro">{falha}</p>}
        <div className="acoes">
          <button type="button" className="botao principal" onClick={salvar} disabled={salvando}>
            Salvar local
          </button>
          <button type="button" className="botao" onClick={onCancelar}>
            Cancelar
          </button>
        </div>
      </main>
    </>
  )
}
