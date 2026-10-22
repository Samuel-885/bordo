export const fluxo = {
  nome: 'Fase 5: conferência na saída (contagem rápida, por nome, sair sem todos)',
  async executar(h) {
    const { esperar, igual, passo, botao, voltar, abrirDemo, escolherCenario, lerBanco, tiposDosEventos, dialogoAberto } = h
    const quadro = (page) => page.locator('section[aria-label="Situação da conferência"]')
    const nome = (n) => `Passageiro fictício ${String(n).padStart(2, '0')}`
    const toque = (page, n) => page.locator('ul[aria-label="Passageiros"] li button', { hasText: nome(n) }).click()

    // Chegada atrasada em Monlevade: parados lá às 08:55. Saem 35 confirmados e 3 que embarcam ali.
    async function abrirConferencia() {
      const { ctx, page } = await h.novaPagina()
      await abrirDemo(page)
      await escolherCenario(page, 'Chegada atrasada em Monlevade')
      await botao(page, 'SAÍMOS').click()
      await page.getByText('Saída de Ponto de embarque').waitFor()
      return { ctx, page }
    }

    {
      const { ctx, page } = await abrirConferencia()

      await passo('abre no estado do ponto de embarque: 35 a bordo confirmados e os 3 que embarcam pendentes', async () => {
        const texto = await quadro(page).innerText()
        esperar(texto.includes('ATENÇÃO') && texto.includes('35/38'), `quadro inesperado: ${texto}`)
        esperar(texto.includes(nome(36)) && texto.includes(nome(38)), `faltam os 3 nomes: ${texto}`)
        esperar(await botao(page, 'SAÍMOS').isDisabled(), 'SAÍMOS deveria estar desligado com pendentes')
        esperar(await botao(page, 'Sair sem todos').isVisible(), 'Sair sem todos ausente')
      })

      await passo('contagem rápida diferente (37): mostra a diferença e não confirma ninguém', async () => {
        await page.locator('#contagem').fill('37')
        await botao(page, 'Conferir').click()
        await page.getByText('Faltam 1 pessoa em relação aos 38 esperados. Confira por nome.').waitFor()
        esperar((await quadro(page).innerText()).includes('35/38'), 'a contagem alterou a lista')
      })

      await passo('trocar o modo reinicia a lista (todos desceram = todos pendentes) e voltar a reinicia de novo', async () => {
        await botao(page, 'Todos desceram').click()
        esperar((await quadro(page).innerText()).includes('0/38'), 'todos deveriam estar pendentes')
        // O ponto obrigatório começa em "só alguns" com o estado de embarque (35/38): é a ele que a lista volta.
        await botao(page, 'Só alguns').click()
        esperar((await quadro(page).innerText()).includes('35/38'), 'a lista deveria voltar ao estado de embarque')
        await botao(page, 'Todos desceram').click()
        await toque(page, 1) // um toque em "todos desceram" confirma uma pessoa
        esperar((await quadro(page).innerText()).includes('1/38'), 'o toque deveria confirmar uma pessoa')
        await botao(page, 'Todos desceram').click() // tocar no modo já selecionado não reinicia
        esperar((await quadro(page).innerText()).includes('1/38'), 'tocar no mesmo modo não deve reiniciar')
      })

      await passo('contagem rápida igual (38): confirma todos e a saída sai "completa por contagem"', async () => {
        await page.locator('#contagem').fill('38')
        await botao(page, 'Conferir').click()
        await page.getByText('A contagem confere: todos confirmados.').waitFor()
        esperar((await quadro(page).innerText()).includes('TODOS A BORDO'), 'quadro deveria mostrar todos a bordo')
        await botao(page, 'SAÍMOS').click()
        await page.locator('.estado-viagem').waitFor()
        const tipos = await tiposDosEventos(page)
        igual(tipos.slice(-2).join(','), 'conferencia,saida', 'últimos eventos')
        const c = (await lerBanco(page, 'eventos')).find((e) => e.tipo === 'conferencia')
        igual(c.dados.resultado, 'completa_por_contagem', 'resultado da conferência')
        igual(String(c.dados.confirmados.length), '38', 'confirmados')
        const aBordo = await page.locator('.a-bordo').innerText()
        esperar(aBordo.includes('38/38 a bordo · conferido às 08:55'), `a bordo inesperado: ${aBordo}`)
      })
      await ctx.close()
    }

    {
      const { ctx, page } = await abrirConferencia()

      await passo('Voltar sem registrar: nada é gravado', async () => {
        await voltar(page)
        await page.locator('.estado-viagem').waitFor()
        esperar(!(await tiposDosEventos(page)).includes('conferencia'), 'a conferência foi gravada ao voltar')
        esperar(!(await tiposDosEventos(page)).slice(-1).includes('saida'), 'a saída foi gravada ao voltar')
        await botao(page, 'SAÍMOS').click()
        await page.getByText('Saída de Ponto de embarque').waitFor()
      })

      await passo('por nome: tocar nos pendentes confirma um a um', async () => {
        await toque(page, 36)
        await toque(page, 37)
        esperar((await quadro(page).innerText()).includes('37/38'), 'deveriam estar 37 confirmados')
        esperar((await quadro(page).innerText()).includes(nome(38)), 'o 38 deveria faltar')
      })

      await passo('sair sem todos exige status e motivo e grava conferência, status e saída juntos', async () => {
        await botao(page, 'Sair sem todos').click()
        const folha = dialogoAberto(page)
        esperar(await folha.getByRole('button', { name: 'SAÍMOS sem eles' }).isDisabled(), 'deveria estar desligado sem status e motivo')
        await folha.getByLabel('Não embarcou').check()
        esperar(await folha.getByRole('button', { name: 'SAÍMOS sem eles' }).isDisabled(), 'ainda falta o motivo')
        await folha.locator('input[id^="motivo-"]').fill('Não apareceu no ponto')
        await folha.getByRole('button', { name: 'SAÍMOS sem eles' }).click()
        await page.locator('.estado-viagem').waitFor()
        const eventos = (await lerBanco(page, 'eventos')).sort((a, b) => (a.sequencia ?? 0) - (b.sequencia ?? 0))
        igual(eventos.slice(-3).map((e) => e.tipo).join(','), 'conferencia,status_passageiro,saida', 'últimos eventos')
        const [conf, status] = eventos.slice(-3)
        igual(conf.dados.resultado, 'incompleta', 'resultado')
        igual(`${status.dados.passageiroId}:${status.dados.status}`, 'demo-p-38:nao_embarcou', 'status')
        igual(status.dados.motivo, 'Não apareceu no ponto', 'motivo')
        const aBordo = await page.locator('.a-bordo').innerText()
        esperar(aBordo.includes('37/37 a bordo'), `a contagem seguinte deveria ser 37: ${aBordo}`)
      })

      await passo('a timeline mostra a conferência incompleta e o status com o nome (só no celular)', async () => {
        await botao(page, 'Timeline').click()
        await page.getByText(`${nome(38)}: não embarcou`).waitFor()
        await page.getByText(`37/38 a bordo · Falta: ${nome(38)}`).waitFor()
      })
      await ctx.close()
    }
  },
}
