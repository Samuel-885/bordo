export const fluxo = {
  nome: 'PARAMOS e VOLTAMOS: quem desceu, conferência "só alguns" e previsão com a duração real',
  async executar(h) {
    const { esperar, igual, passo, botao, abrirDemo, escolherCenario, defineRelogio, lerBanco, dialogoAberto } = h
    const nome = (n) => `Passageiro fictício ${String(n).padStart(2, '0')}`
    const { ctx, page } = await h.novaPagina()
    await abrirDemo(page)
    // Seis passos: saída de Ipatinga, chegada e saída de Monlevade (09:14). Em viagem para o almoço, com 38 a bordo.
    await escolherCenario(page, 'Parada não planejada', 6)
    await defineRelogio(page, '10:00')

    const previsaoDoAlmoco = async () => (await page.locator('[aria-label="Próxima etapa"]').innerText()).replace(/\s+/g, ' ')
    const eventos = async (tipo) => (await lerBanco(page, 'eventos')).filter((e) => e.tipo === tipo)

    await passo('PARAMOS com 20 min previstos e a folha "Quem desceu?" abre sozinha', async () => {
      await botao(page, 'PARAMOS', { exact: true }).click()
      await page.getByText('Café / lanche').click()
      await page.locator('#parada-onde').fill('Padaria Exemplo')
      await page.locator('#parada-tempo').fill('20')
      await dialogoAberto(page).getByRole('button', { name: 'Registrar parada' }).click()
      await page.getByRole('heading', { name: 'Quem desceu?' }).waitFor()
    })

    await passo('marcar quem desceu na parada não planejada: dois passageiros', async () => {
      await botao(page, 'Escolher nomes').click()
      const itens = dialogoAberto(page).locator('ul[aria-label="Passageiros a bordo"] li button')
      igual(String(await itens.count()), '38', 'passageiros a bordo na lista')
      await dialogoAberto(page).locator('li button', { hasText: nome(1) }).click()
      await dialogoAberto(page).locator('li button', { hasText: nome(2) }).click()
      await botao(page, 'Salvar (2 desceram)').click()
      await page.getByText('Desceram: 2').waitFor()
      const marcacao = (await eventos('desceram'))[0]
      igual(marcacao.dados.local, 'nao_planejada', 'local da marcação')
      igual(marcacao.dados.passageiroIds.sort().join(','), 'demo-p-01,demo-p-02', 'ids marcados')
    })

    await passo('VOLTAMOS às 10:14 abre a conferência "só alguns": só quem desceu fica pendente, com o aviso', async () => {
      await defineRelogio(page, '10:14')
      await botao(page, 'VOLTAMOS', { exact: true }).click()
      await page.getByText('2 desceram, 36 ficaram no ônibus.').waitFor()
      const quadro = await page.locator('section[aria-label="Situação da conferência"]').innerText()
      esperar(quadro.includes('36/38'), `quadro inesperado: ${quadro}`)
      esperar(quadro.includes(nome(1)) && quadro.includes(nome(2)), `pendentes inesperados: ${quadro}`)
      esperar(await botao(page, 'Só alguns').getAttribute('aria-pressed') === 'true', 'o modo deveria ser "Só alguns"')
      esperar(await botao(page, 'VOLTAMOS', { exact: true }).isDisabled(), 'VOLTAMOS deveria estar desligado com pendentes')
    })

    await passo('confirmar os dois que voltaram ao ônibus e registrar o VOLTAMOS', async () => {
      const lista = page.locator('ul[aria-label="Passageiros"]')
      await lista.locator('li button', { hasText: nome(1) }).click()
      await lista.locator('li button', { hasText: nome(2) }).click()
      await botao(page, 'VOLTAMOS', { exact: true }).click()
      await page.getByText('VOLTAMOS registrado às 10:14.').waitFor()
      const conf = (await eventos('conferencia')).find((e) => e.dados.momento === 'volta')
      igual(conf.dados.modo, 'so_alguns', 'modo da conferência')
      igual(conf.dados.resultado, 'completa', 'resultado da conferência')
      igual(String(conf.dados.confirmados.length), '38', 'confirmados')
      const fim = (await eventos('parada_nao_planejada')).find((e) => e.dados.fase === 'fim')
      esperar(!!fim, 'VOLTAMOS não gravado')
      igual(fim.horarioFato.slice(11, 16), '10:14', 'horário do VOLTAMOS')
    })

    await passo('com a parada fechada vale a duração real (14 min): almoço 12:48, não os 20 previstos', async () => {
      esperar((await previsaoDoAlmoco()).includes('12:48'), `previsão deveria ser 12:48: ${await previsaoDoAlmoco()}`)
      esperar((await page.locator('[aria-label="Parada não planejada"]').count()) === 0, 'o cartão da parada deveria sumir')
      const aBordo = (await page.locator('.a-bordo').innerText()).replace(/\s+/g, ' ')
      esperar(aBordo.includes('38/38 a bordo · conferido às 10:14'), `a bordo inesperado: ${aBordo}`)
    })

    await passo('DESFAZER retira a conferência e o VOLTAMOS juntos: a parada reabre e volta a 12:54', async () => {
      await botao(page, 'DESFAZER').click()
      await page.waitForTimeout(300)
      igual(String((await eventos('parada_nao_planejada')).filter((e) => e.dados.fase === 'fim').length), '0', 'VOLTAMOS ainda gravado')
      igual(String((await eventos('conferencia')).length), '0', 'conferências ainda gravadas')
      esperar((await previsaoDoAlmoco()).includes('12:54'), `previsão deveria voltar a 12:54: ${await previsaoDoAlmoco()}`)
    })
    await ctx.close()
  },
}
