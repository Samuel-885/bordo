export const fluxo = {
  nome: 'PARAMOS: café com lugar e tempo previsto (previsão ao parar, estourar, ajustar, desfazer)',
  async executar(h) {
    const { esperar, igual, passo, botao, dialogoAberto, abrirDemo, escolherCenario, defineRelogio, lerBanco } = h
    const { ctx, page } = await h.novaPagina()
    await abrirDemo(page)
    // Seis passos: saída de Ipatinga, chegada e saída de Monlevade (09:14). Em viagem para o almoço.
    await escolherCenario(page, 'Parada não planejada', 6)
    await defineRelogio(page, '10:00')

    const previsaoDoAlmoco = async () => (await page.locator('[aria-label="Próxima parada"]').innerText()).replace(/\s+/g, ' ')
    const eventosDaParada = async () => (await lerBanco(page, 'eventos')).filter((e) => e.tipo === 'parada_nao_planejada')

    await passo('a folha do PARAMOS tem "Café / lanche", "Onde" com a dica de privacidade e o tempo previsto', async () => {
      await botao(page, 'PARAMOS', { exact: true }).click()
      esperar(await page.getByText('Café / lanche').isVisible(), 'motivo Café / lanche ausente')
      esperar(await page.getByText('Nome do lugar. Sem nomes de passageiros.').isVisible(), 'dica do "Onde" ausente')
      esperar(await page.locator('#parada-tempo').isVisible(), 'campo do tempo previsto ausente')
    })

    await passo('um tempo previsto inválido é recusado com a mensagem do núcleo e nada é gravado', async () => {
      await page.getByText('Café / lanche').click()
      await page.locator('#parada-tempo').fill('601')
      await dialogoAberto(page).getByRole('button', { name: 'Registrar parada' }).click()
      await page.getByText('O tempo previsto vai de 1 a 600 minutos, inteiros.').waitFor()
      igual(String((await eventosDaParada()).length), '0', 'eventos gravados')
    })

    await passo('registra o PARAMOS com motivo, lugar e 20 min: a previsão já mostra o impacto (12:54)', async () => {
      await page.locator('#parada-onde').fill('  Padaria Exemplo ')
      await page.locator('#parada-tempo').fill('20')
      await dialogoAberto(page).getByRole('button', { name: 'Registrar parada' }).click()
      await page.getByText('PARAMOS registrado às 10:00.').waitFor()
      const [inicio] = await eventosDaParada()
      igual(inicio.dados.motivo, 'cafe', 'motivo')
      igual(inicio.dados.onde, 'Padaria Exemplo', 'onde aparado')
      igual(String(inicio.dados.tempoPrevistoMin), '20', 'tempo previsto')
      // A folha "Quem desceu?" abre sozinha depois do PARAMOS.
      await botao(page, 'Agora não').click()
      esperar((await previsaoDoAlmoco()).includes('12:54'), `previsão do almoço deveria ser 12:54: ${await previsaoDoAlmoco()}`)
    })

    await passo('o cartão mostra o lugar, "Previsto 20 min" e "faltam 20 min"', async () => {
      const cartao = (await page.locator('[aria-label="Parada não planejada"]').innerText()).replace(/\s+/g, ' ')
      esperar(cartao.includes('Padaria Exemplo'), `lugar ausente: ${cartao}`)
      esperar(cartao.includes('Previsto 20 min') && cartao.includes('faltam 20 min'), `previsto/faltam ausente: ${cartao}`)
    })

    await passo('dentro do previsto a previsão não cresce (10:12: 12:54, faltam 8 min)', async () => {
      await defineRelogio(page, '10:12')
      esperar((await previsaoDoAlmoco()).includes('12:54'), 'a previsão cresceu dentro do previsto')
      esperar((await page.locator('[aria-label="Parada não planejada"]').innerText()).includes('faltam 8 min'), 'faltam 8 min ausente')
    })

    await passo('estourando (10:35) a previsão acompanha o relógio (13:09) e o cartão diz "excedeu em 15 min"', async () => {
      await defineRelogio(page, '10:35')
      esperar((await previsaoDoAlmoco()).includes('13:09'), `previsão deveria ser 13:09: ${await previsaoDoAlmoco()}`)
      esperar((await page.locator('[aria-label="Parada não planejada"]').innerText()).includes('excedeu em 15 min'), 'excedeu em 15 min ausente')
    })

    await passo('ajustar na mesma folha: tempo 60 vale como evento "previsao" com o estado completo; DESFAZER volta', async () => {
      await botao(page, 'Alterar lugar e tempo previsto').click()
      igual(await page.locator('#parada-onde').inputValue(), 'Padaria Exemplo', 'onde preenchido')
      igual(await page.locator('#parada-tempo').inputValue(), '20', 'tempo preenchido')
      await page.locator('#parada-tempo').fill('60')
      await dialogoAberto(page).getByRole('button', { name: 'Salvar' }).click()
      await page.getByText('Parada ajustada.').waitFor()
      const ajuste = (await eventosDaParada()).find((e) => e.dados.fase === 'previsao')
      igual(ajuste.dados.onde, 'Padaria Exemplo', 'onde no evento previsao')
      igual(String(ajuste.dados.tempoPrevistoMin), '60', 'tempo no evento previsao')
      // 10:00 + 60 min = 11:00; 12:34 + 60 = 13:34.
      esperar((await previsaoDoAlmoco()).includes('13:34'), `previsão deveria ser 13:34: ${await previsaoDoAlmoco()}`)
      await botao(page, 'DESFAZER').click()
      await page.waitForTimeout(300)
      igual(String((await eventosDaParada()).filter((e) => e.dados.fase === 'previsao').length), '0', 'eventos previsao')
      esperar((await previsaoDoAlmoco()).includes('13:09'), 'a previsão deveria voltar a 13:09')
    })

    await passo('apagar o tempo no ajuste volta a contar até agora (10:35: 13:09) e some "Previsto"', async () => {
      await botao(page, 'Alterar lugar e tempo previsto').click()
      await page.locator('#parada-tempo').fill('')
      await dialogoAberto(page).getByRole('button', { name: 'Salvar' }).click()
      await page.getByText('Parada ajustada.').waitFor()
      await page.waitForTimeout(300)
      const cartao = (await page.locator('[aria-label="Parada não planejada"]').innerText()).replace(/\s+/g, ' ')
      esperar(!cartao.includes('Previsto') && cartao.includes('Padaria Exemplo'), `cartão inesperado: ${cartao}`)
      esperar((await previsaoDoAlmoco()).includes('13:09'), 'a previsão deveria seguir o relógio')
    })

    await passo('a timeline mostra "PARAMOS · Café / lanche · Padaria Exemplo" e a mensagem de atualização não leva o lugar nem o motivo', async () => {
      await h.abrirTimeline(page)
      await page.getByText('Café / lanche · Padaria Exemplo · previsto 20 min').waitFor()
      await page.getByText('Parada ajustada').first().waitFor()
      await h.irParaAba(page, 'viagem')
      await botao(page, 'Mensagem', { exact: true }).click()
      await page.locator('#mensagem-texto').waitFor()
      const texto = await h.textoPrevia(page)
      esperar(!texto.includes('Padaria') && !texto.includes('Café'), `lugar ou motivo vazou na mensagem: ${texto}`)
      esperar(texto.includes('parada não planejada'), `situação ausente na mensagem: ${texto}`)
      await dialogoAberto(page).getByRole('button', { name: 'Cancelar' }).or(dialogoAberto(page).getByRole('button', { name: 'Fechar' })).first().click().catch(() => {})
    })
    await ctx.close()
  },
}
