// Mudança de roteiro em viagem: incluir parada, cancelar, trocar por local novo e o trecho em curso.

export const fluxo = {
  nome: 'Mudança de roteiro em viagem (parada incluída, local novo, cancelar)',
  async executar(h) {
    const { aguardar, esperar, igual, passo, botao, abrirDemo, escolherCenario, lerBanco, tiposDosEventos, abrirParadas, abrirTimeline, abrirItemDeMais, dialogoAberto } = h
    const { ctx, page } = await h.novaPagina()
    await abrirDemo(page)
    await escolherCenario(page, 'Chegada atrasada em Monlevade')
    const ultimos = async (n) => (await tiposDosEventos(page)).slice(-n).join(',')

    await passo('Roteiro > Paradas oferece "+ Incluir parada" e a tela pede local, categoria e tempos', async () => {
      await abrirParadas(page)
      await page.locator('[data-teste="incluir-parada"]').click()
      await page.locator('[data-teste="mudanca-de-roteiro"]').waitFor()
      esperar((await page.locator('#mr-apos').innerText()).includes('posição atual'), 'a posição atual deveria vir marcada')
      esperar(await botao(page, 'INCLUIR PARADA').isDisabled(), 'sem local e tempos, não deveria incluir')
    })

    await passo('cadastra o local novo na hora e ele já vem escolhido', async () => {
      await botao(page, 'Cadastrar novo local').click()
      await page.locator('#l-nome').fill('Mirante do Vale')
      await page.locator('#l-cidade').fill('Cidade X')
      await page.locator('#l-coord').fill('-19.9, -43.1')
      await botao(page, 'Salvar local').click()
      await page.locator('#mr-local').waitFor()
      igual(await page.locator('#mr-local').inputValue() === '' ? 'vazio' : 'escolhido', 'escolhido', 'o local novo deveria estar escolhido')
    })

    await passo('sem coordenadas no vizinho, a rota não está disponível e o texto explica; nada é estimado', async () => {
      await page.locator('#mr-permanencia').fill('40')
      esperar((await page.locator('[data-teste="mr-ate"]').innerText()).includes('Sem coordenadas'), 'deveria avisar que não há rota')
      esperar(await botao(page, 'INCLUIR PARADA').isDisabled(), 'sem os tempos não deveria incluir')
    })

    await passo('com os tempos digitados mostra a prévia (+50 min no destino) e inclui', async () => {
      await page.locator('#mr-ate-m').fill('30')
      await page.locator('#mr-de-h').fill('3')
      await page.locator('[data-teste="mudanca-previa"]').waitFor()
      const previa = await page.locator('[data-teste="mudanca-previa"]').innerText()
      esperar(previa.includes('+50 min no destino'), `prévia: ${previa}`)
      await botao(page, 'INCLUIR PARADA').click()
      await page.getByText('Parada incluída: Mirante do Vale.').waitFor()
      igual(await ultimos(1), 'parada_incluida', 'evento gravado')
    })

    await passo('a parada aparece no Roteiro como incluída, sem original, e na timeline', async () => {
      await abrirParadas(page)
      const item = page.locator('[data-teste="parada-incluida"]')
      esperar(await item.isVisible(), 'a marca "incluída" deveria aparecer')
      await abrirTimeline(page)
      await page.getByText('Parada incluída: Mirante do Vale').waitFor()
    })

    await passo('DESFAZER retira a parada', async () => {
      await botao(page, 'DESFAZER').click()
      await aguardar(async () => !(await tiposDosEventos(page)).includes('parada_incluida'), true, 'o evento deveria ter sumido')
    })

    await passo('incluir de novo e cancelar a parada incluída: ela some e o evento de cancelamento é gravado', async () => {
      await abrirParadas(page)
      await page.locator('[data-teste="incluir-parada"]').click()
      await page.locator('#mr-local').selectOption({ label: 'Mirante do Vale · Cidade X' })
      await page.locator('#mr-ate-m').fill('30')
      await page.locator('#mr-de-h').fill('3')
      await botao(page, 'INCLUIR PARADA').click()
      await page.getByText('Parada incluída: Mirante do Vale.').waitFor()
      await abrirParadas(page)
      await page.locator('[data-teste="cancelar-inclusao"]').click()
      await dialogoAberto(page).getByRole('button', { name: 'Cancelar parada' }).click()
      await page.getByText('Parada incluída cancelada: Mirante do Vale.').waitFor()
      igual(await ultimos(2), 'parada_incluida,inclusao_cancelada', 'eventos')
      await aguardar(() => page.locator('[data-teste="parada-incluida"]').count(), 0, 'a parada deveria ter deixado o roteiro')
      await abrirTimeline(page)
      await page.getByText('Parada incluída cancelada: Mirante do Vale').waitFor()
    })

    await passo('"Outro local…" na tela de alternativas troca a parada por um local novo e o DESFAZER retira os dois eventos', async () => {
      await h.abrirAlternativas(page)
      await page.locator('section.cartao', { hasText: 'Almoço' }).locator('[data-teste="outro-local"]').click()
      await page.locator('#mr-local').selectOption({ label: 'Mirante do Vale · Cidade X' })
      await page.locator('#mr-ate-h').fill('3')
      await page.locator('#mr-ate-m').fill('30')
      await page.locator('#mr-de-h').fill('3')
      await botao(page, 'TROCAR PARA ESTE LOCAL').click()
      await page.getByText('Local trocado para Mirante do Vale.').waitFor()
      igual(await ultimos(2), 'local_incluido,troca_local', 'eventos')
      esperar((await page.locator('.alternativa', { hasText: 'Mirante do Vale' }).innerText()).includes('ESCOLHIDA'), 'o local novo deveria estar escolhido')
      await botao(page, 'DESFAZER').click()
      await aguardar(async () => !(await tiposDosEventos(page)).includes('local_incluido'), true, 'os dois eventos deveriam ter sumido')
    })

    await passo('o plano original não foi tocado', async () => {
      const viagem = (await lerBanco(page, 'viagens'))[0]
      esperar(!JSON.stringify(viagem.planoOriginal).includes('Mirante'), 'o original não deveria mencionar a parada')
      const etapas = await lerBanco(page, 'etapas')
      esperar(etapas.every((e) => e.alternativas.every((a) => a !== 'Mirante do Vale')) && etapas.length === 6, 'as etapas gravadas não mudam')
    })
    await ctx.close()

    // Em trânsito: o trecho até a parada nova está em curso, só vale com a chegada pelo Google Maps.
    const outra = await h.novaPagina()
    const p2 = outra.page
    await abrirDemo(p2)
    await escolherCenario(p2, 'Recalibração pelo Google Maps', 6)
    await passo('em trânsito, a parada nova só vale com a chegada pelo Google Maps', async () => {
      await abrirItemDeMais(p2, 'Incluir parada')
      await p2.locator('[data-teste="mudanca-de-roteiro"]').waitFor()
      await botao(p2, 'Cadastrar novo local').click()
      await p2.locator('#l-nome').fill('Cachoeira')
      await p2.locator('#l-cidade').fill('Cidade Y')
      await botao(p2, 'Salvar local').click()
      await p2.locator('#mr-local').waitFor()
      await p2.locator('#mr-de-h').fill('3')
      esperar((await p2.locator('[data-teste="mudanca-de-roteiro"]').innerText()).includes('está em curso'), 'deveria pedir a chegada pelo Maps')
      esperar(await botao(p2, 'INCLUIR PARADA').isDisabled(), 'sem a chegada, não inclui')
      await p2.locator('#mr-chegada').fill('11:00')
      await p2.locator('[data-teste="mudanca-previa"]').waitFor()
      await botao(p2, 'INCLUIR PARADA').click()
      await p2.getByText('Parada incluída: Cachoeira.').waitFor()
      igual((await tiposDosEventos(p2)).slice(-2).join(','), 'parada_incluida,recalibracao', 'eventos')
    })
    await outra.ctx.close()
  },
}
