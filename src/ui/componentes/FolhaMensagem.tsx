// Prévia de uma mensagem (atualização ou restaurante): texto editável, COPIAR e COMPARTILHAR.
// O texto editado é o que sai. Quem usa decide o que gerar e o que registrar ao usar.

import { useEffect, useRef, useState } from 'react'
import { compartilharTexto, copiarTexto } from '../logica/compartilhar'

interface Props {
  titulo: string
  /** O texto preenchido com o estado atual e, se o modelo salvo tinha problema, o aviso. */
  gerar: () => { texto: string; aviso: string | null }
  /** Quando muda (dados da viagem alterados), o texto é refeito. */
  chave: string
  /** Chamado uma vez por prévia, no primeiro COPIAR ou COMPARTILHAR que der certo. */
  aoUsar?: () => void | Promise<void>
  onEditarModelo: () => void
  /** Abre a folha de identificação e equipe. */
  onDados?: () => void
  onFechar: () => void
}

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const ligar = () => setOnline(true)
    const desligar = () => setOnline(false)
    window.addEventListener('online', ligar)
    window.addEventListener('offline', desligar)
    return () => {
      window.removeEventListener('online', ligar)
      window.removeEventListener('offline', desligar)
    }
  }, [])
  return online
}

export function FolhaMensagem({ titulo, gerar, chave, aoUsar, onEditarModelo, onDados, onFechar }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const online = useOnline()
  const [texto, setTexto] = useState(() => gerar().texto)
  const [retorno, setRetorno] = useState<string | null>(null)
  const usou = useRef(false)
  const chaveAnterior = useRef(chave)
  const { aviso } = gerar()

  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
  }, [])

  useEffect(() => {
    if (chaveAnterior.current === chave) return
    chaveAnterior.current = chave
    setTexto(gerar().texto)
    setRetorno('Os dados mudaram: o texto foi refeito.')
  })

  async function marcarUso() {
    if (usou.current) return
    usou.current = true
    await aoUsar?.()
  }

  async function copiar() {
    const ok = await copiarTexto(texto)
    setRetorno(ok ? 'Copiado. Agora é só colar na conversa.' : 'Não foi possível copiar. Selecione o texto e copie à mão.')
    if (ok) await marcarUso()
  }

  async function compartilhar() {
    const r = await compartilharTexto(texto)
    if (r === 'cancelado') return setRetorno(null)
    if (r === 'falhou') return setRetorno('Não foi possível abrir o compartilhamento. Use COPIAR.')
    setRetorno(r === 'whatsapp' ? 'Abrindo o WhatsApp com o texto.' : 'Compartilhado.')
    await marcarUso()
  }

  return (
    <dialog ref={ref} className="folha folha-mensagem" onCancel={(e) => { e.preventDefault(); onFechar() }}>
      <h2>{titulo}</h2>
      {aviso && <p className="msg-erro" role="alert">{aviso}</p>}
      <div className="campo">
        <label htmlFor="mensagem-texto">Texto (pode editar antes de enviar)</label>
        <textarea id="mensagem-texto" rows={10} value={texto} onChange={(e) => setTexto(e.target.value)} />
      </div>
      <p className={`aviso-rede ${online ? '' : 'offline'}`}>
        {online ? 'Sem sinal, a mensagem só sai quando houver internet.' : 'Sem internet agora: dá para copiar, mas a mensagem só sai quando houver sinal.'}
      </p>
      {retorno && <p className="dica" role="status">{retorno}</p>}
      <div className="acoes colunas">
        <button type="button" className="botao principal" disabled={texto.trim() === ''} onClick={() => void copiar()}>
          COPIAR
        </button>
        <button type="button" className="botao" disabled={texto.trim() === ''} onClick={() => void compartilhar()}>
          COMPARTILHAR
        </button>
        <div className="acoes-linha">
          <button type="button" className="botao pequeno" onClick={onEditarModelo}>
            Editar modelo
          </button>
          {onDados && (
            <button type="button" className="botao pequeno" onClick={onDados}>
              Identificação e equipe
            </button>
          )}
          <button type="button" className="botao pequeno" onClick={onFechar}>
            Fechar
          </button>
        </div>
      </div>
    </dialog>
  )
}
