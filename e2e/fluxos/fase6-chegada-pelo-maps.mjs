export const fluxo = {
  nome: 'Fase 6: escolher alternativa sem o trecho em curso (chegada pelo Google Maps)',
  async executar(h) {
    const { aguardar, esperar, igual, passo, botao, abrirDemo, escolherCenario, lerBanco, apagarDoBanco, tiposDosEventos, dialogoAberto } = h
    const { ctx, page } = await h.novaPagina()
    await abrirDemo(page)
    await escolherCenario(page, 'Recalibração pelo Google Maps', 7)
    // Falta o tempo de Monlevade até o Restaurante B (o trecho em curso para ele).
    await apagarDoBanco(page, 'trechos', ['demo-monlevade', 'demo-l-monlevade', 'demo-almoco', 'demo-l-rest-b'])
    await h.abrirAlternativas(page)
    await page.locator('.alternativa').first().waitFor()
    const alternativa = (nome) => page.locator('.alternativa', { hasText: nome })
    const antes = (await lerBanco(page, 'eventos')).length

    await passo('B fica "Sem tempo", com a dica, e o ESCOLHER continua disponível', async () => {
      const b = await alternativa('Restaurante B').innerText()
      esperar(b.includes('Sem tempo'), `classe de B: ${b}`)
      esperar(b.includes('Informe a chegada pelo Google Maps para escolher.'), 'dica ausente')
      esperar(await alternativa('Restaurante B').getByRole('button', { name: 'ESCOLHER' }).isEnabled(), 'ESCOLHER deveria estar ligado')
    })

    await passo('ESCOLHER pede a chegada pelo Google Maps; sem horário não deixa trocar', async () => {
      await alternativa('Restaurante B').getByRole('button', { name: 'ESCOLHER' }).click()
      await page.getByText('Chegada no Restaurante B pelo Google Maps').waitFor()
      esperar(await dialogoAberto(page).getByRole('button', { name: 'Trocar' }).isDisabled(), 'Trocar deveria estar desligado sem horário')
      igual(String((await lerBanco(page, 'eventos')).length), String(antes), 'eventos antes de informar')
    })

    await passo('informar 13:10 grava a troca e a recalibração juntas', async () => {
      await page.locator('#recalibracao-hora').fill('13:10')
      await dialogoAberto(page).getByRole('button', { name: 'Trocar' }).click()
      await page.getByText('Local trocado para Restaurante B, chegada às 13:10.').waitFor()
      igual((await tiposDosEventos(page)).slice(antes).join(','), 'troca_local,recalibracao', 'eventos novos')
      const troca = (await lerBanco(page, 'eventos')).find((e) => e.tipo === 'troca_local')
      igual(troca.dados.localId, 'demo-l-rest-b', 'local da troca')
      const b = await alternativa('Restaurante B').innerText()
      esperar(b.includes('ESCOLHIDA') && b.includes('13:10'), `B depois da troca: ${b}`)
    })

    await passo('DESFAZER retira os dois eventos e B volta a "Sem tempo"', async () => {
      await botao(page, 'DESFAZER').click()
      await aguardar(async () => String((await lerBanco(page, 'eventos')).length), String(antes), 'eventos depois do desfazer')
      await aguardar(async () => (await alternativa('Restaurante B').innerText()).includes('Sem tempo'), true, 'B deveria voltar a "Sem tempo"')
    })
    await ctx.close()
  },
}
