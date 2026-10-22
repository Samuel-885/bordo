export const fluxo = {
  nome: 'Fase 7: atualização (prévia, copiar, compartilhar, timeline, sem Web Share e sem internet)',
  async executar(h) {
    const { esperar, igual, passo, botao, voltar, dialogoAberto, abrirDemo, escolherCenario, defineRelogio, lerBanco, textoPrevia } = h

    const ESPERADO = [
      '🚌 Atualização da viagem',
      'Unidade Demo — Ipatinga',
      '',
      'Situação: em viagem',
      'Próxima parada: Ponto de embarque, às 08:42',
      'Chegada em Ribeirão Preto: 23:47 (atraso de 17 min)',
      'Passageiros: 35 a bordo',
      '',
      'Atualizado às 06:50',
    ].join('\n')
    const geradas = async (page) => (await lerBanco(page, 'eventos')).filter((e) => e.tipo === 'atualizacao_gerada')

    {
      const { ctx, page } = await h.novaPagina()
      await abrirDemo(page)

      await passo('planejamento: identificação e equipe gravam ao sair do campo', async () => {
        await page.locator('#v-identificacao').fill('Unidade Demo — Ipatinga')
        await page.locator('#v-equipe').fill('2')
        await page.locator('#v-equipe').blur()
        await page.waitForTimeout(300)
        const viagens = await lerBanco(page, 'viagens')
        igual(String(viagens[0].equipe), '2', 'equipe gravada')
        igual(viagens[0].identificacao, 'Unidade Demo — Ipatinga', 'identificação gravada')
        await page.locator('#v-equipe').fill('0')
        await page.locator('#v-equipe').blur()
      })

      await escolherCenario(page, 'Saída atrasada')
      await defineRelogio(page, '06:50')

      await passo('GERAR ATUALIZAÇÃO e OBSERVAÇÃO aparecem com a viagem em andamento', async () => {
        esperar(await botao(page, 'GERAR ATUALIZAÇÃO').isVisible(), 'GERAR ATUALIZAÇÃO ausente')
        esperar(await botao(page, 'OBSERVAÇÃO').isVisible(), 'OBSERVAÇÃO ausente')
      })

      await passo('a prévia traz o texto do modelo padrão, com o aviso de sinal, sem gravar nada', async () => {
        await botao(page, 'GERAR ATUALIZAÇÃO').click()
        await page.locator('#mensagem-texto').waitFor()
        igual(await textoPrevia(page), ESPERADO, 'texto da prévia')
        esperar(await page.getByText('Sem sinal, a mensagem só sai quando houver internet.').isVisible(), 'aviso ausente')
        igual(String((await geradas(page)).length), '0', 'atualizações gravadas ao abrir')
      })

      await passo('COPIAR coloca o texto na área de transferência e grava uma atualização gerada, sem o texto', async () => {
        await botao(page, 'COPIAR').click()
        await page.getByText('Copiado.').waitFor()
        igual(await page.evaluate(() => navigator.clipboard.readText()), ESPERADO, 'área de transferência')
        await page.waitForTimeout(250)
        const eventos = await geradas(page)
        igual(String(eventos.length), '1', 'atualizações geradas')
        igual(eventos[0].dados.atrasoMin, 17, 'atraso gravado')
        esperar(!JSON.stringify(eventos[0]).includes('Situação'), 'o texto vazou para o evento')
      })

      await passo('COPIAR de novo e COMPARTILHAR na mesma prévia não repetem o evento; o texto editado é o que sai', async () => {
        await botao(page, 'COPIAR').click()
        await page.locator('#mensagem-texto').fill('Texto editado na prévia')
        await botao(page, 'COMPARTILHAR').click()
        await page.getByText('Compartilhado.').waitFor()
        igual(JSON.stringify(await page.evaluate(() => window.__compartilhados)), JSON.stringify([{ text: 'Texto editado na prévia' }]), 'share')
        igual(String(await page.evaluate(() => window.__abertos.length)), '0', 'não abre o WhatsApp quando há share')
        await page.waitForTimeout(250)
        igual(String((await geradas(page)).length), '1', 'ainda uma atualização gerada')
      })

      await passo('uma nova prévia e COMPARTILHAR gravam a segunda atualização', async () => {
        await dialogoAberto(page).getByRole('button', { name: 'Fechar', exact: true }).click()
        await botao(page, 'GERAR ATUALIZAÇÃO').click()
        await page.locator('#mensagem-texto').waitFor()
        await botao(page, 'COMPARTILHAR').click()
        await page.getByText('Compartilhado.').waitFor()
        await page.waitForTimeout(250)
        igual(String((await geradas(page)).length), '2', 'duas atualizações geradas')
        await dialogoAberto(page).getByRole('button', { name: 'Fechar', exact: true }).click()
      })

      await passo('a timeline mostra "Atualização gerada · previsão 23:47 (+17 min)" duas vezes, sem o texto', async () => {
        await botao(page, 'Timeline').click()
        await page.getByText('Atualização gerada · previsão 23:47 (+17 min)').first().waitFor()
        igual(String(await page.getByText('Atualização gerada · previsão 23:47 (+17 min)').count()), '2', 'linhas na timeline')
        esperar(!(await page.content()).includes('Texto editado na prévia'), 'o texto aparece na timeline')
        await voltar(page)
        await page.locator('.atraso').waitFor()
        igual((await page.locator('.atraso').innerText()).trim(), '+17 min', 'a previsão não mudou')
      })
      await ctx.close()
    }

    {
      const { ctx, page } = await h.novaPagina({ comShare: false })
      await abrirDemo(page)
      await escolherCenario(page, 'Saída atrasada')
      await defineRelogio(page, '06:50')
      await botao(page, 'GERAR ATUALIZAÇÃO').click()
      await page.locator('#mensagem-texto').waitFor()

      await passo('sem Web Share, COMPARTILHAR abre o link do WhatsApp com o texto', async () => {
        await botao(page, 'COMPARTILHAR').click()
        await page.getByText('Abrindo o WhatsApp com o texto.').waitFor()
        const abertos = await page.evaluate(() => window.__abertos)
        igual(String(abertos.length), '1', 'abas abertas')
        esperar(abertos[0].startsWith('https://wa.me/?text='), `link inesperado: ${abertos[0]}`)
        igual(decodeURIComponent(abertos[0].split('text=')[1]), ESPERADO, 'texto no link')
        igual(String((await geradas(page)).length), '1', 'a atualização gerada foi gravada')
      })

      await passo('sem internet: o aviso ganha destaque e COPIAR continua funcionando', async () => {
        await ctx.setOffline(true)
        await page.waitForTimeout(300)
        const aviso = page.locator('.aviso-rede')
        esperar((await aviso.getAttribute('class')).includes('offline'), 'o aviso não ficou em destaque')
        esperar((await aviso.innerText()).includes('Sem internet agora'), 'texto do aviso offline')
        await page.locator('#mensagem-texto').fill('Mensagem copiada offline')
        await botao(page, 'COPIAR').click()
        await page.getByText('Copiado.').waitFor()
        igual(await page.evaluate(() => navigator.clipboard.readText()), 'Mensagem copiada offline', 'área de transferência offline')
        await ctx.setOffline(false)
      })
      await ctx.close()
    }

    {
      const { ctx, page } = await h.novaPagina()
      await abrirDemo(page)
      await escolherCenario(page, 'Saída atrasada')
      await defineRelogio(page, '06:50')
      await passo('a atualização gerada no meio não impede o DESFAZER da observação', async () => {
        await botao(page, 'OBSERVAÇÃO').click()
        await page.locator('#observacao-texto').fill('Teste do desfazer')
        await dialogoAberto(page).getByRole('button', { name: 'Registrar' }).click()
        await page.getByText('Observação registrada.').waitFor()
        await botao(page, 'GERAR ATUALIZAÇÃO').click()
        await page.locator('#mensagem-texto').waitFor()
        await dialogoAberto(page).getByRole('button', { name: 'COPIAR' }).click()
        await page.getByText('Copiado.').waitFor()
        await page.waitForTimeout(250)
        await dialogoAberto(page).getByRole('button', { name: 'Fechar', exact: true }).click()
        await botao(page, 'DESFAZER').click()
        await page.waitForTimeout(300)
        const eventos = await lerBanco(page, 'eventos')
        esperar(!eventos.some((e) => e.tipo === 'observacao'), 'a observação deveria ter sido desfeita')
        esperar(eventos.some((e) => e.tipo === 'atualizacao_gerada'), 'a atualização gerada deveria continuar')
      })
      await ctx.close()
    }
  },
}
