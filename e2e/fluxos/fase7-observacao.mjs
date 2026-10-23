export const fluxo = {
  nome: 'Fase 7: observação (registrar, desfazer, corrigir pela timeline)',
  async executar(h) {
    const { esperar, igual, passo, botao, voltar, dialogoAberto, abrirDemo, escolherCenario, defineRelogio, lerBanco, textoPrevia } = h
    const { ctx, page } = await h.novaPagina()
    await abrirDemo(page)
    await escolherCenario(page, 'Saída atrasada')
    await defineRelogio(page, '06:50')

    await passo('OBSERVAÇÃO abre a folha com horário em agora, contador, limite e a dica de privacidade', async () => {
      await h.abrirItemDeMais(page, 'Observação')
      igual(await page.locator('#observacao-hora').inputValue(), '06:50', 'horário inicial')
      esperar(await page.getByText('Fica só no celular. Não entra nas mensagens automáticas.').isVisible(), 'dica ausente')
      esperar(await page.getByText('0/500').isVisible(), 'contador ausente')
      esperar(await dialogoAberto(page).getByRole('button', { name: 'Registrar' }).isDisabled(), 'Registrar deveria estar desligado sem texto')
      igual(await page.locator('#observacao-texto').getAttribute('maxlength'), '500', 'limite de caracteres')
    })

    await passo('registra a observação com horário anterior e mostra DESFAZER', async () => {
      await page.locator('#observacao-hora').fill('06:45')
      await page.locator('#observacao-texto').fill('Chuva forte na serra, ônibus devagar')
      await dialogoAberto(page).getByRole('button', { name: 'Registrar' }).click()
      await page.getByText('Observação registrada.').waitFor()
      esperar(await botao(page, 'DESFAZER').isVisible(), 'DESFAZER ausente')
      const obs = (await lerBanco(page, 'eventos')).filter((e) => e.tipo === 'observacao')
      igual(String(obs.length), '1', 'observações')
      igual(obs[0].horarioFato.slice(11, 16), '06:45', 'horário do fato')
      igual(obs[0].dados.texto, 'Chuva forte na serra, ônibus devagar', 'texto')
    })

    await passo('DESFAZER apaga a observação', async () => {
      await botao(page, 'DESFAZER').click()
      await page.waitForTimeout(300)
      igual(String((await lerBanco(page, 'eventos')).filter((e) => e.tipo === 'observacao').length), '0', 'observações')
    })

    await passo('registra de novo: a timeline mostra horário e texto e a previsão não muda', async () => {
      await h.abrirItemDeMais(page, 'Observação')
      await page.locator('#observacao-texto').fill('Parada rápida para o motorista')
      await dialogoAberto(page).getByRole('button', { name: 'Registrar' }).click()
      await page.getByText('Observação registrada.').waitFor()
      await h.irParaAba(page, 'viagem')
      igual((await page.locator('.selo-atraso').innerText()).trim(), '+17 min', 'o atraso mudou')
      await h.abrirTimeline(page)
      await page.getByText('Parada rápida para o motorista').waitFor()
    })

    await passo('corrigir pela timeline: texto e horário', async () => {
      await page.getByText('Parada rápida para o motorista').click()
      await page.getByText('Corrigir observação').waitFor()
      igual(await page.locator('#observacao-texto').inputValue(), 'Parada rápida para o motorista', 'texto preenchido')
      igual(await page.locator('#observacao-hora').inputValue(), '06:50', 'horário preenchido')
      await page.locator('#observacao-texto').fill('Parada rápida para o motorista (corrigido)')
      await page.locator('#observacao-hora').fill('06:40')
      await dialogoAberto(page).getByRole('button', { name: 'Salvar' }).click()
      await page.getByText('Parada rápida para o motorista (corrigido)').waitFor()
      const obs = (await lerBanco(page, 'eventos')).filter((e) => e.tipo === 'observacao')
      igual(obs[0].horarioFato.slice(11, 16), '06:40', 'horário corrigido')
      igual(obs[0].dados.texto, 'Parada rápida para o motorista (corrigido)', 'texto corrigido')
    })

    await passo('horário digitado que cairia no futuro vira o dia anterior e o dia aparece', async () => {
      await page.getByText('Parada rápida para o motorista (corrigido)').click()
      await page.locator('#observacao-hora').fill('07:30')
      await page.getByText('07:30 do dia 13').waitFor()
      await dialogoAberto(page).getByRole('button', { name: 'Cancelar' }).click()
    })

    await passo('a observação nunca vaza para a mensagem de atualização', async () => {
      await h.irParaAba(page, 'viagem')
      await botao(page, 'Mensagem', { exact: true }).click()
      await page.locator('#mensagem-texto').waitFor()
      const texto = await textoPrevia(page)
      esperar(!texto.includes('motorista') && !texto.includes('Chuva'), 'a observação vazou na mensagem')
    })
    await ctx.close()
  },
}
