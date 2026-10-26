import { readFileSync } from 'node:fs'

export const fluxo = {
  nome: 'Fase 10b: relatório em PDF (viagem concluída da demonstração, sem nomes por padrão)',
  async executar(h) {
    const { aguardar, esperar, igual, passo, botao, abrirDemo, escolherCenario, irParaAba, abrirItemDeMais } = h
    const { ctx, page } = await h.novaPagina()
    await abrirDemo(page)
    await escolherCenario(page, 'Chegada ao destino')

    const relatorio = () => page.locator('[data-teste="relatorio"]')
    const texto = () => relatorio().innerText()
    const secao = (id) => page.locator(`[data-teste="relatorio-${id}"]`).innerText()

    await passo('o cartão "Viagem encerrada" tem o atalho e abre o relatório, com o cabeçalho', async () => {
      await page.locator('[data-teste="abrir-relatorio"]').click()
      await relatorio().waitFor()
      const t = (await texto()).toLowerCase()
      for (const esperado of ['Relatório da viagem', 'Viagem de demonstração', 'Ida', 'Concluída']) esperar(t.includes(esperado.toLowerCase()), `faltou "${esperado}" no cabeçalho`)
      esperar(!t.includes('Viagem em andamento'), 'não deveria avisar andamento')
    })

    await passo('resumo: saída e chegada original × real, atraso final e duração total', async () => {
      const t = (await secao('resumo')).replace(/\s+/g, ' ')
      esperar(/Saída 06:30 06:47/.test(t), `saída: ${t}`)
      esperar(/Chegada 23:30 23:47/.test(t), `chegada: ${t}`)
      esperar(/Atraso final \+17 min/.test(t), `atraso final: ${t}`)
      esperar(/Duração total 17h00/.test(t), `duração: ${t}`)
      esperar(/Quilometragem/.test(t), 'quilometragem ausente')
    })

    await passo('permanência nas paradas: 4 paradas, total parado e em movimento', async () => {
      const t = (await secao('permanencia')).replace(/\s+/g, ' ')
      const linhas = await page.locator('[data-teste="relatorio-permanencia"] tbody tr').count()
      igual(String(linhas), '4', 'linhas de permanência')
      esperar(/Total parado.*2h35/.test(t), `total parado: ${t}`)
      esperar(/Em movimento.*14h25/.test(t), `em movimento: ${t}`)
    })

    await passo('onde o atraso nasceu: atraso +17 desde a saída, variação 0 nas demais linhas', async () => {
      const linhas = await page.locator('[data-teste="relatorio-atraso"] tbody tr').allInnerTexts()
      igual(String(linhas.length), '6', 'etapas na tabela')
      esperar(/\+17 min/.test(linhas[0]), `origem: ${linhas[0]}`)
      esperar(/0 min \/ 0 min/.test(linhas[1].replace(/\s+/g, ' ')), `Monlevade sem variação: ${linhas[1]}`)
    })

    await passo('sem nomes por padrão: só contagens', async () => {
      const t = await texto()
      esperar(!t.includes('Passageiro fictício'), 'o relatório trouxe nomes sem a opção')
      esperar(/Cadastrados\s*38/.test(await secao('passageiros')), 'cadastrados')
      esperar(/Chegaram ao destino\s*38/.test(await secao('passageiros')), 'chegaram')
    })

    await passo('"Incluir nomes" mostra o aviso de dados pessoais e a lista; desmarcar tira', async () => {
      await page.getByLabel('Incluir nomes').check()
      await page.locator('[data-teste="aviso-nomes"]').waitFor()
      esperar((await texto()).includes('Passageiro fictício'), 'a lista de nomes não apareceu')
      esperar(!(await page.locator('[data-teste="aviso-observacoes"]').isVisible()), 'as opções não são independentes')
      await page.getByLabel('Incluir nomes').uncheck()
      await aguardar(async () => (await texto()).includes('Passageiro fictício'), false, 'os nomes deveriam sumir')
    })

    await passo('BAIXAR PDF entrega um PDF válido', async () => {
      const [download] = await Promise.all([page.waitForEvent('download'), botao(page, 'BAIXAR PDF').click()])
      esperar(/^relatorio-viagem-\d{4}-\d{2}-\d{2}\.pdf$/.test(download.suggestedFilename()), `nome: ${download.suggestedFilename()}`)
      const bytes = readFileSync(await download.path())
      igual(bytes.subarray(0, 5).toString('latin1'), '%PDF-', 'cabeçalho do PDF')
      esperar(bytes.length > 2000, `PDF pequeno demais: ${bytes.length} bytes`)
      esperar(bytes.subarray(-8).toString('latin1').includes('%%EOF'), 'PDF sem fim de arquivo')
    })

    await passo('COMPARTILHAR PDF entrega o arquivo ao menu do celular', async () => {
      await botao(page, 'COMPARTILHAR PDF').click()
      const compartilhado = await aguardar(() => page.evaluate(() => window.__compartilhados.at(-1) ?? null), (v) => v !== null, 'o menu de compartilhar deveria receber o PDF')
      igual(compartilhado.arquivos[0].type, 'application/pdf', 'tipo do arquivo')
      esperar(compartilhado.arquivos[0].texto.startsWith('%PDF-'), 'o arquivo compartilhado não é um PDF')
      await page.getByText(/entregue ao menu de compartilhar/).waitFor()
    })

    await passo('o gerador de PDF está no cache do service worker (funciona sem internet)', async () => {
      const sw = await page.evaluate(() => fetch('/sw.js').then((r) => r.text()))
      esperar(/jspdf\.es\.min-[\w-]+\.js/.test(sw), 'o pedaço do jsPDF não está no precache')
    })

    await passo('as opções começam desligadas a cada vez que a tela abre', async () => {
      await page.getByLabel('Incluir nomes').check()
      await page.getByLabel('Incluir observações').check()
      await page.getByRole('button', { name: 'Voltar à viagem' }).click()
      await page.locator('[data-teste="abrir-relatorio"]').click()
      await relatorio().waitFor()
      esperar(!(await page.getByLabel('Incluir nomes').isChecked()), 'nomes deveria começar desligado')
      esperar(!(await page.getByLabel('Incluir observações').isChecked()), 'observações deveria começar desligado')
    })

    await passo('Mais › Relatório abre a mesma tela', async () => {
      await page.getByRole('button', { name: 'Voltar à viagem' }).click()
      await abrirItemDeMais(page, 'Relatório')
      await relatorio().waitFor()
    })
    await ctx.close()

    // Viagem em andamento: aviso e só o que já aconteceu.
    const andamento = await h.novaPagina()
    await abrirDemo(andamento.page)
    await escolherCenario(andamento.page, 'Chegada atrasada em Monlevade')
    await passo('viagem em andamento: aviso "em andamento", sem chegada real e sem "chegaram"', async () => {
      const p = andamento.page
      await irParaAba(p, 'mais')
      await p.locator('.item-menu', { hasText: 'Relatório' }).first().click()
      await p.locator('[data-teste="relatorio"]').waitFor()
      const t = await p.locator('[data-teste="relatorio"]').innerText()
      esperar(t.includes('Viagem em andamento'), 'faltou o aviso de andamento')
      esperar(t.includes('Em andamento'), 'status')
      esperar(/Chegaram ao destino\s*viagem ainda não chegou/.test(t), 'chegaram')
      esperar(t.includes('(previsto)'), 'a chegada prevista deveria vir marcada')
    })
    await andamento.ctx.close()
  },
}
