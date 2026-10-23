import { describe, expect, it, vi } from 'vitest'
import { estadoDoBackup } from '../../../core/backup'
import { instante } from '../../../core/tempo'
import { baixarArquivo, compartilharArquivo, criarArquivoDeBackup, podeCompartilharArquivo } from '../backupArquivo'
import { dataHoraBr, dataHoraCurta, linhaDoUltimoBackup, quandoFoiOBackup } from '../backup'

const t = (s: string) => instante(`2026-11-14T${s}:00-03:00`)
const arquivo = () => criarArquivoDeBackup('{"app":"bordo"}', 'bordo-backup-2026-11-14-0805.txt')

describe('arquivo de backup', () => {
  it('sai como texto puro: o Chrome do Android recusa application/json', () => {
    const a = arquivo()
    expect(a.type).toBe('text/plain')
    expect(a.name.endsWith('.txt')).toBe(true)
  })

  it('só oferece compartilhar quando o navegador aceita o arquivo', () => {
    const aceita = { share: vi.fn(), canShare: vi.fn(() => true) }
    expect(podeCompartilharArquivo(arquivo(), aceita)).toBe(true)
    expect(aceita.canShare).toHaveBeenCalledWith({ files: [expect.any(File)] })
    expect(podeCompartilharArquivo(arquivo(), { share: vi.fn(), canShare: () => false })).toBe(false)
    expect(podeCompartilharArquivo(arquivo(), { share: vi.fn() })).toBe(false)
    expect(podeCompartilharArquivo(arquivo(), {})).toBe(false)
    expect(podeCompartilharArquivo(arquivo(), { share: vi.fn(), canShare: () => { throw new Error('x') } })).toBe(false)
  })

  it('compartilha, informa cancelamento e falha', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    expect(await compartilharArquivo(arquivo(), { share, canShare: () => true })).toBe('compartilhado')
    expect(share).toHaveBeenCalledWith({ files: [expect.any(File)], title: 'Backup do Bordo' })
    const cancela = vi.fn().mockRejectedValue(new DOMException('cancelado', 'AbortError'))
    expect(await compartilharArquivo(arquivo(), { share: cancela, canShare: () => true })).toBe('cancelado')
    const quebra = vi.fn().mockRejectedValue(new Error('recusou'))
    expect(await compartilharArquivo(arquivo(), { share: quebra, canShare: () => true })).toBe('falhou')
    expect(await compartilharArquivo(arquivo(), { share, canShare: () => false })).toBe('falhou')
  })

  it('download: cria o link com o nome do arquivo, clica e solta o endereço depois', () => {
    vi.useFakeTimers()
    const link = { href: '', download: '', style: {}, click: vi.fn() }
    const doc = { createElement: vi.fn(() => link), body: { appendChild: vi.fn(), removeChild: vi.fn() } } as unknown as Document
    const urls = { createObjectURL: vi.fn(() => 'blob:abc'), revokeObjectURL: vi.fn() }
    baixarArquivo(arquivo(), doc, urls)
    expect(link).toMatchObject({ href: 'blob:abc', download: 'bordo-backup-2026-11-14-0805.txt' })
    expect(link.click).toHaveBeenCalledOnce()
    expect(urls.revokeObjectURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(10_000)
    expect(urls.revokeObjectURL).toHaveBeenCalledWith('blob:abc')
    vi.useRealTimers()
  })
})

describe('textos do backup', () => {
  it('quando foi: hoje, ontem ou a data', () => {
    expect(quandoFoiOBackup(t('08:12'), t('09:00'))).toBe('hoje 08:12')
    expect(quandoFoiOBackup(instante('2026-11-13T21:40:00-03:00'), t('09:00'))).toBe('ontem 21:40')
    expect(quandoFoiOBackup(instante('2026-11-10T21:40:00-03:00'), t('09:00'))).toBe('10/11 21:40')
    expect(dataHoraBr(t('08:12'))).toBe('14/11/2026 08:12')
    expect(dataHoraCurta(t('08:12'))).toBe('14/11 08:12')
  })

  it('linha da tela principal', () => {
    expect(linhaDoUltimoBackup(estadoDoBackup(null, 3, t('09:00')), t('09:00'))).toBe('Último backup: nunca')
    const ultimo = { geradoEm: t('08:12'), totalEventos: 10 }
    expect(linhaDoUltimoBackup(estadoDoBackup(ultimo, 10, t('09:00')), t('09:00'))).toBe('Último backup: hoje 08:12')
    expect(linhaDoUltimoBackup(estadoDoBackup(ultimo, 11, t('09:00')), t('09:00'))).toBe('Último backup: hoje 08:12 · 1 registro depois')
    expect(linhaDoUltimoBackup(estadoDoBackup(ultimo, 13, t('09:00')), t('09:00'))).toBe('Último backup: hoje 08:12 · 3 registros depois')
  })
})
