import { describe, expect, it, vi } from 'vitest'
import { compartilharTexto, copiarTexto, linkDoWhatsApp } from '../compartilhar'

const TEXTO = 'Atualização\nPrevisão 23:47 & mais'

describe('copiar', () => {
  it('usa a área de transferência quando existe', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    expect(await copiarTexto(TEXTO, { clipboard: { writeText } as unknown as Clipboard }, {} as Document)).toBe(true)
    expect(writeText).toHaveBeenCalledWith(TEXTO)
  })

  it('quando a área de transferência recusa, copia pela textarea', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('negado'))
    const campo = { value: '', style: {}, setAttribute: vi.fn(), select: vi.fn() }
    const doc = {
      createElement: vi.fn(() => campo),
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
      execCommand: vi.fn(() => true),
    } as unknown as Document
    expect(await copiarTexto(TEXTO, { clipboard: { writeText } as unknown as Clipboard }, doc)).toBe(true)
    expect(campo.value).toBe(TEXTO)
    expect(doc.execCommand).toHaveBeenCalledWith('copy')
  })

  it('sem área de transferência e sem como copiar, devolve falso', async () => {
    const doc = {
      createElement: () => ({ style: {}, setAttribute: () => undefined, select: () => undefined }),
      body: { appendChild: () => undefined, removeChild: () => undefined },
      execCommand: () => false,
    } as unknown as Document
    expect(await copiarTexto(TEXTO, { clipboard: undefined as unknown as Clipboard }, doc)).toBe(false)
  })
})

describe('compartilhar', () => {
  it('com a Web Share API, usa o menu nativo e não abre o WhatsApp', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const abrir = vi.fn()
    expect(await compartilharTexto(TEXTO, { share }, abrir)).toBe('menu')
    expect(share).toHaveBeenCalledWith({ text: TEXTO })
    expect(abrir).not.toHaveBeenCalled()
  })

  it('sem Web Share API, abre o link do WhatsApp com o texto', async () => {
    const abrir = vi.fn(() => ({}) as Window)
    expect(await compartilharTexto(TEXTO, { share: undefined as unknown as Navigator['share'] }, abrir)).toBe('whatsapp')
    expect(abrir).toHaveBeenCalledWith(`https://wa.me/?text=${encodeURIComponent(TEXTO)}`)
  })

  it('o link do WhatsApp codifica quebras de linha e símbolos', () => {
    const url = linkDoWhatsApp(TEXTO)
    expect(url).toBe('https://wa.me/?text=Atualiza%C3%A7%C3%A3o%0APrevis%C3%A3o%2023%3A47%20%26%20mais')
    expect(decodeURIComponent(url.split('text=')[1]!)).toBe(TEXTO)
  })

  it('a pessoa fecha o menu: cancelado, sem abrir o WhatsApp', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('cancelado', 'AbortError'))
    const abrir = vi.fn()
    expect(await compartilharTexto(TEXTO, { share }, abrir)).toBe('cancelado')
    expect(abrir).not.toHaveBeenCalled()
  })

  it('o menu falha por outro motivo: cai no link do WhatsApp', async () => {
    const share = vi.fn().mockRejectedValue(new Error('sem suporte'))
    const abrir = vi.fn(() => ({}) as Window)
    expect(await compartilharTexto(TEXTO, { share }, abrir)).toBe('whatsapp')
  })

  it('o navegador bloqueia a nova aba: falhou', async () => {
    expect(await compartilharTexto(TEXTO, { share: undefined as unknown as Navigator['share'] }, () => null)).toBe('falhou')
  })
})
