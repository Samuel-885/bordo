// Correções dos testes reais no celular (viagem urbana curta). Um passo por correção.

export const fluxo = {
  nome: 'Correções do teste no celular: trocar de viagem, encerrada, espaço do rodapé',
  async executar(h) {
    const { esperar, igual, passo, botao, abrirDemo, escolherCenario, irParaAba, abrirItemDeMais } = h
    const { ctx, page } = await h.novaPagina()

    const naLista = async () => {
      await botao(page, 'Nova viagem').waitFor()
      esperar(!(await page.locator('.barra-abas').isVisible()), 'a lista de viagens não tem a barra de abas')
    }
    const trocarDeViagemAposAbas = async () => {
      await irParaAba(page, 'roteiro')
      await irParaAba(page, 'pessoas')
      await irParaAba(page, 'mais')
      await page.locator('.item-menu', { hasText: 'Trocar de viagem' }).click()
      await naLista()
    }

    await passo('Trocar de viagem no planejamento, depois de passar por três abas, volta à lista', async () => {
      await abrirDemo(page)
      await trocarDeViagemAposAbas()
    })

    await passo('Trocar de viagem em viagem em andamento volta à lista', async () => {
      await abrirDemo(page)
      await escolherCenario(page, 'Saída atrasada', 2)
      await trocarDeViagemAposAbas()
    })

    await passo('Trocar de viagem em viagem concluída volta à lista, e o voltar do navegador sai da lista sem voltar às abas', async () => {
      await abrirDemo(page)
      await escolherCenario(page, 'Chegada ao destino')
      await trocarDeViagemAposAbas()
      await page.goBack().catch(() => {})
      await page.waitForTimeout(200)
      esperar(!(await page.locator('.barra-abas').isVisible()), 'depois do voltar do navegador, as abas não reaparecem')
    })

    await ctx.close()
  },
}
