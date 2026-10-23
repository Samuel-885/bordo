export const fluxo = {
  nome: 'Fase 7: modelos de mensagem (editor, variável desconhecida, voltar ao padrão, prévia ao vivo)',
  async executar(h) {
    const { esperar, igual, passo, botao, voltar, dialogoAberto, abrirDemo, escolherCenario, defineRelogio, lerBanco, escreverBanco, textoPrevia } = h

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

    {
      const { ctx, page } = await h.novaPagina()
      await abrirDemo(page)
      await escolherCenario(page, 'Saída atrasada')
      await defineRelogio(page, '06:50')
      await botao(page, 'Mensagem', { exact: true }).click()
      await page.locator('#mensagem-texto').waitFor()
      await botao(page, 'Editar modelo').click()
      await page.locator('#modelo-texto').waitFor()

      await passo('o editor mostra o padrão, as variáveis e a prévia ao vivo da viagem', async () => {
        esperar((await page.locator('#modelo-texto').inputValue()).startsWith('🚌 Atualização da viagem\n{identificacao}'), 'modelo padrão')
        for (const v of ['identificacao', 'situacao', 'proxima_parada', 'hora_proxima', 'previsao_destino', 'destino', 'passageiros', 'agora']) {
          esperar(await page.getByRole('button', { name: `{${v}}`, exact: true }).isVisible(), `variável ${v} ausente`)
        }
        esperar(await page.getByText('Prévia (viagem atual)').isVisible(), 'prévia ao vivo ausente')
        igual(await page.locator('.previa-modelo').innerText(), ESPERADO, 'prévia ao vivo')
      })

      await passo('variável desconhecida mostra o aviso e impede salvar', async () => {
        await page.locator('#modelo-texto').fill('Teste {xyz} e {agora}')
        await page.getByText('Variável desconhecida: {xyz}. Corrija para salvar.').waitFor()
        esperar(await botao(page, 'SALVAR').isDisabled(), 'SALVAR deveria estar desligado')
      })

      await passo('tocar na variável insere no cursor', async () => {
        await page.locator('#modelo-texto').fill('Partiu às  e fim')
        await page.locator('#modelo-texto').evaluate((el) => {
          el.focus()
          el.setSelectionRange(10, 10)
        })
        await botao(page, '{agora}', { exact: true }).click()
        igual(await page.locator('#modelo-texto').inputValue(), 'Partiu às {agora} e fim', 'texto com a variável no cursor')
        igual(await page.locator('.previa-modelo').innerText(), 'Partiu às 06:50 e fim', 'prévia atualizada')
      })

      await passo('um modelo com todas as variáveis salva e a prévia sai com os dados da viagem', async () => {
        const todas = 'ID={identificacao}\nSIT={situacao}\nPROX={proxima_parada}\nHORA={hora_proxima}\nPREV={previsao_destino}\nDEST={destino}\nPAX={passageiros}\nAGORA={agora}'
        await page.locator('#modelo-texto').fill(todas)
        await botao(page, 'SALVAR').click()
        await page.getByText('Modelo salvo.').waitFor()
        igual(
          await page.locator('.previa-modelo').innerText(),
          'ID=Unidade Demo — Ipatinga\nSIT=em viagem\nPROX=Ponto de embarque\nHORA=08:42\nPREV=23:47 (atraso de 17 min)\nDEST=Ribeirão Preto\nPAX=35 a bordo\nAGORA=06:50',
          'prévia com todas as variáveis',
        )
        igual((await lerBanco(page, 'modelos')).find((m) => m.id === 'atualizacao').texto, todas, 'gravado no banco')
      })

      await passo('a mensagem gerada passa a usar o modelo salvo', async () => {
        await voltar(page)
        await botao(page, 'Mensagem', { exact: true }).click()
        await page.locator('#mensagem-texto').waitFor()
        igual((await textoPrevia(page)).split('\n')[1], 'SIT=em viagem', 'segunda linha da mensagem')
        await dialogoAberto(page).getByRole('button', { name: 'Fechar', exact: true }).click()
      })
      await ctx.close()
    }

    {
      const { ctx, page } = await h.novaPagina()
      await abrirDemo(page)
      await escolherCenario(page, 'Saída atrasada')
      await defineRelogio(page, '06:50')
      // Um modelo antigo, com variável que não existe mais, gravado direto no banco.
      await escreverBanco(page, 'modelos', { id: 'atualizacao', texto: 'Antigo {variavel_que_sumiu}', atualizadoEm: '2026-11-14T06:00:00-03:00' })
      // O banco foi mexido por fora: abrir outra tela e voltar recarrega os dados da viagem.
      await h.abrirItemDeMais(page, 'Modelos de mensagem')
      await voltar(page)
      await h.irParaAba(page, 'viagem')

      await passo('modelo salvo com variável desconhecida: a geração usa o padrão e avisa', async () => {
        await botao(page, 'Mensagem', { exact: true }).click()
        await page.locator('#mensagem-texto').waitFor()
        igual(await textoPrevia(page), ESPERADO, 'texto padrão')
        esperar(await page.getByText('usei o modelo padrão').isVisible(), 'aviso ausente')
      })

      await passo('Voltar ao padrão: confirmação e o modelo salvo é apagado', async () => {
        await botao(page, 'Editar modelo').click()
        await page.locator('#modelo-texto').waitFor()
        esperar((await page.locator('#modelo-texto').inputValue()).includes('variavel_que_sumiu'), 'o editor deveria mostrar o salvo')
        await botao(page, 'Voltar ao padrão').first().click()
        await page.getByText('será apagado').waitFor()
        await page.getByRole('dialog').getByRole('button', { name: 'Voltar ao padrão' }).click()
        await page.getByText('Voltou ao modelo padrão.').waitFor()
        esperar((await page.locator('#modelo-texto').inputValue()).startsWith('🚌 Atualização da viagem'), 'o texto não voltou ao padrão')
        igual(String((await lerBanco(page, 'modelos')).length), '0', 'linhas no banco')
      })

      await passo('a lista de viagens abre os modelos; sem viagem em andamento, a prévia é de exemplo', async () => {
        await botao(page, 'Sair', { exact: true }).click()
        await botao(page, 'MODELOS DE MENSAGEM').click()
        await page.getByText('Prévia (exemplo)').waitFor()
        const previa = await page.locator('.previa-modelo').innerText()
        esperar(previa.includes('Unidade Exemplo — Ipatinga') && previa.includes('35 a bordo'), `prévia de exemplo inesperada:\n${previa}`)
        await page.getByRole('tab', { name: 'Restaurante' }).click()
        esperar((await page.locator('.previa-modelo').innerText()).includes('grupo de 41 pessoas'), 'prévia do restaurante (exemplo)')
      })
      await ctx.close()
    }
  },
}
