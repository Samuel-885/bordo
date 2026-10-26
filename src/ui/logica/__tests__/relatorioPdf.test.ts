// Texto do relatório e PDF (fase 10b). Nomes de locais e passageiros são fictícios.

import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { montarRelatorio, OPCOES_PADRAO } from '../../../core/relatorio'
import { congelar, ev, EVENTOS_CASO_3, h, PASSAGEIROS, PLANO } from '../../../core/__tests__/fixtures'
import { montarDocumento, textoDaDiferenca } from '../relatorioDocumento'
import { gerarPdfDoRelatorio, textoSeguroParaPdf } from '../relatorioPdf'

const plano = { ...PLANO, viagem: { ...PLANO.viagem, status: 'em_andamento' as const, planoOriginal: congelar() } }
const eventos = [...EVENTOS_CASO_3, ev.parada('almoco', 'inicio', h('10:00'), { motivo: 'cafe', onde: 'Padaria Fictícia' }), ev.parada('almoco', 'fim', h('10:20')), ev.observacao('Anotação fictícia', h('10:30'))]

function documento(opcoes = OPCOES_PADRAO) {
  return montarDocumento(montarRelatorio(plano, eventos, PASSAGEIROS, h('11:00'), null, opcoes), plano, eventos)
}

describe('textoDaDiferenca', () => {
  it('sinal de menos de verdade, zero e vazio', () => {
    expect(textoDaDiferenca(17)).toBe('+17 min')
    expect(textoDaDiferenca(-5)).toBe('−5 min')
    expect(textoDaDiferenca(75)).toBe('+1h15')
    expect(textoDaDiferenca(0)).toBe('0 min')
    expect(textoDaDiferenca(null)).toBe('—')
  })
})

describe('montarDocumento', () => {
  it('seções na ordem pedida: resumo, permanência logo depois, atraso, ocorrências, comunicação, passageiros', () => {
    expect(documento().secoes.map((s) => s.id)).toEqual(['resumo', 'permanencia', 'atraso', 'ocorrencias', 'comunicacao', 'passageiros'])
  })
  it('por padrão sem nomes de passageiros e sem o texto da observação', () => {
    const texto = JSON.stringify(documento())
    expect(texto).not.toContain('Passageiro 0')
    expect(texto).not.toContain('Anotação fictícia')
    expect(texto).toContain('Padaria Fictícia')
    expect(texto).toContain('texto não incluído')
  })
  it('com as opções ligadas (independentes), entram nomes e o texto da observação, com o aviso', () => {
    const nomes = documento({ incluirNomes: true, incluirObservacoes: false })
    expect(JSON.stringify(nomes)).toContain('Passageiro 01')
    expect(JSON.stringify(nomes)).not.toContain('Anotação fictícia')
    expect(nomes.avisos.join(' ')).toContain('dados pessoais')
    const obs = documento({ incluirNomes: false, incluirObservacoes: true })
    expect(JSON.stringify(obs)).toContain('Anotação fictícia')
    expect(JSON.stringify(obs)).not.toContain('Passageiro 01')
  })
  it('em andamento avisa; as contagens usam "Cadastrados", não "Esperados"', () => {
    const d = documento()
    expect(d.avisos[0]).toContain('em andamento')
    const texto = JSON.stringify(d)
    expect(texto).toContain('Cadastrados')
    expect(texto).not.toContain('Esperados')
  })
})

describe('PDF', () => {
  it('textoSeguroParaPdf troca o que a fonte padrão não tem e mantém os acentos', () => {
    expect(textoSeguroParaPdf('−5 min → ação · São Paulo — ok')).toBe('-5 min -> ação · São Paulo — ok')
    expect(textoSeguroParaPdf('ônibus 🚌')).toBe('ônibus ?')
  })
  it('gera um arquivo application/pdf válido com o nome combinado e mais de uma página quando precisa', async () => {
    const arquivo = await gerarPdfDoRelatorio(documento({ incluirNomes: true, incluirObservacoes: true }))
    expect(arquivo.type).toBe('application/pdf')
    expect(arquivo.name).toMatch(/^relatorio-viagem-\d{4}-\d{2}-\d{2}\.pdf$/)
    const bytes = new Uint8Array(await arquivo.arrayBuffer())
    expect(new TextDecoder('latin1').decode(bytes.subarray(0, 5))).toBe('%PDF-')
    expect(new TextDecoder("latin1").decode(bytes)).toMatch(/\/Count [2-9]/)
    if (process.env.SALVAR_PDF) writeFileSync(process.env.SALVAR_PDF, bytes)
  })
})
