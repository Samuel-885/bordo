export const fluxo = {
  nome: 'Fase 6: alternativas (classes, escolher, confirmação de inviável, desfazer, pular)',
  async executar(h) {
    const { aguardar, esperar, igual, passo, botao, voltar, abrirDemo, escolherCenario, lerBanco, tiposDosEventos } = h
    const { ctx, page } = await h.novaPagina()
    await abrirDemo(page)
    // Todos os passos menos a troca final: saímos de Monlevade às 10:55 e são 10:57 (caso 9).
    await escolherCenario(page, 'Restaurante inviável e troca', 9)
    await h.abrirAlternativas(page)
    await page.getByRole('region', { name: 'Restaurante A' }).or(page.locator('section.cartao').first()).first().waitFor()

    const alternativa = (nome) => page.locator('.alternativa', { hasText: nome })
    const confirmacao = () => page.locator('dialog.confirmar[open]')
    const aviso = (texto) => page.getByText(texto).first().waitFor()

    await passo('classifica: A inviável, B pouca margem, C viável com 25 min de margem (caso 9)', async () => {
      igual((await alternativa('Restaurante A').locator('.classe').innerText()).trim(), 'Inviável', 'classe de A')
      igual((await alternativa('Restaurante B').locator('.classe').innerText()).trim(), 'Pouca margem', 'classe de B')
      igual((await alternativa('Restaurante C').locator('.classe').innerText()).trim(), 'Viável', 'classe de C')
      const c = await alternativa('Restaurante C').innerText()
      esperar(c.includes('15:05') && c.includes('25 min de margem'), `dados de C: ${c}`)
      esperar((await alternativa('Restaurante A').innerText()).includes('ESCOLHIDA'), 'A deveria ser a escolhida')
    })

    await passo('ESCOLHER troca o local (evento troca_local) e mostra DESFAZER', async () => {
      await alternativa('Restaurante C').getByRole('button', { name: 'ESCOLHER' }).click()
      await aviso('Local trocado para Restaurante C.')
      await page.locator('.alternativa.escolhida', { hasText: 'Restaurante C' }).waitFor() // C deveria ficar escolhida
      const troca = (await lerBanco(page, 'eventos')).find((e) => e.tipo === 'troca_local')
      igual(troca.dados.localId, 'demo-l-rest-c', 'local da troca')
    })

    await passo('DESFAZER volta ao Restaurante A', async () => {
      await botao(page, 'DESFAZER').click()
      await aguardar(async () => !(await tiposDosEventos(page)).includes('troca_local'), true, 'a troca deveria ter sido desfeita')
      await aguardar(async () => (await alternativa('Restaurante A').innerText()).includes('ESCOLHIDA'), true, 'A deveria voltar a ser a escolhida')
    })

    await passo('escolher um local inviável pede confirmação; cancelar não grava, confirmar grava', async () => {
      await alternativa('Restaurante C').getByRole('button', { name: 'ESCOLHER' }).click()
      await aviso('Local trocado para Restaurante C.')
      await alternativa('Restaurante A').getByRole('button', { name: 'ESCOLHER' }).click()
      await confirmacao().waitFor()
      esperar((await confirmacao().innerText()).includes('Restaurante A está fechado no horário previsto de chegada'), 'motivo da confirmação')
      await confirmacao().getByRole('button', { name: 'Voltar' }).click()
      igual(String((await tiposDosEventos(page)).filter((t) => t === 'troca_local').length), '1', 'trocas depois de cancelar')
      await alternativa('Restaurante A').getByRole('button', { name: 'ESCOLHER' }).click()
      await confirmacao().getByRole('button', { name: 'Trocar' }).click()
      await aviso('Local trocado para Restaurante A.')
      igual(String((await tiposDosEventos(page)).filter((t) => t === 'troca_local').length), '2', 'trocas depois de confirmar')
    })

    await passo('PULAR ESTA PARADA pede confirmação, risca a parada e o DESFAZER a devolve', async () => {
      const cafe = page.locator('section.cartao', { hasText: 'Lanchonete do café' })
      await cafe.getByRole('button', { name: 'PULAR ESTA PARADA' }).click()
      await confirmacao().waitFor()
      await confirmacao().getByRole('button', { name: 'Pular' }).click()
      await aviso('Café pulada.')
      esperar((await tiposDosEventos(page)).includes('pular_etapa'), 'pular_etapa deveria estar gravado')
      await aguardar(() => page.locator('section.cartao', { hasText: 'Lanchonete do café' }).count(), 0, 'a parada pulada sai da lista')
      await botao(page, 'DESFAZER').click()
      await aguardar(async () => !(await tiposDosEventos(page)).includes('pular_etapa'), true, 'o pulo deveria ter sido desfeito')
      await aguardar(() => page.locator('section.cartao', { hasText: 'Lanchonete do café' }).count(), 1, 'a parada deveria voltar')
    })

    await passo('a tela principal acompanha o local escolhido', async () => {
      await voltar(page)
      await h.irParaAba(page, 'viagem')
      await page.locator('.rodape-fixo').waitFor()
      esperar((await page.locator('section[aria-label="Próxima parada"]').innerText()).includes('Restaurante A'), 'próxima etapa deveria ser o Restaurante A')
    })
    await ctx.close()
  },
}
