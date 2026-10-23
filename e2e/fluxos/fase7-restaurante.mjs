export const fluxo = {
  nome: 'Fase 7: mensagem para o restaurante e LIGAR (tela de alternativas)',
  async executar(h) {
    const { esperar, igual, passo, botao, voltar, dialogoAberto, abrirDemo, escolherCenario, defineRelogio, lerBanco, apagarDoBanco, textoPrevia } = h
    const { ctx, page } = await h.novaPagina()
    await abrirDemo(page)
    await escolherCenario(page, 'Saída atrasada')
    await defineRelogio(page, '06:50')
    await h.abrirAlternativas(page)
    await page.getByText('Mensagem para o restaurante').first().waitFor()

    const alternativa = (nome) => page.locator('.alternativa', { hasText: nome })
    const blocoA = () => alternativa('Restaurante A').locator('.mensagem-restaurante')

    await passo('cada local mostra a mensagem com o grupo (38) e a chegada prevista daquele local', async () => {
      igual(
        await blocoA().locator('.texto-mensagem').innerText(),
        'Olá! Somos um grupo de 38 pessoas (Unidade Demo — Ipatinga), em ônibus, com chegada prevista às 12:17. Podem nos receber? Se o horário mudar, avisamos.',
        'mensagem do Restaurante A',
      )
      const textoC = await alternativa('Restaurante C').locator('.texto-mensagem').innerText()
      esperar(/chegada prevista às (\d\d:\d\d)\./.test(textoC) && !textoC.includes('12:17'), `Restaurante C deveria ter outra chegada: ${textoC}`)
    })

    await passo('o LIGAR aparece só no restaurante com telefone cadastrado, com link tel: só com dígitos', async () => {
      const ligar = alternativa('Restaurante B').getByRole('link', { name: 'LIGAR' })
      igual(await ligar.getAttribute('href'), 'tel:0055550142', 'link do LIGAR')
      igual(String(await alternativa('Restaurante A').getByRole('link', { name: 'LIGAR' }).count()), '0', 'LIGAR no Restaurante A')
      igual(String(await alternativa('Restaurante C').getByRole('link', { name: 'LIGAR' }).count()), '0', 'LIGAR no Restaurante C')
      esperar(await ligar.isVisible(), 'LIGAR invisível')
    })

    await passo('COPIAR copia o texto da mensagem; COMPARTILHAR usa o menu nativo', async () => {
      await blocoA().getByRole('button', { name: 'COPIAR' }).click()
      await page.getByText('Copiado.').first().waitFor()
      esperar((await page.evaluate(() => navigator.clipboard.readText())).startsWith('Olá! Somos um grupo de 38 pessoas'), 'texto copiado')
      await blocoA().getByRole('button', { name: 'COMPARTILHAR' }).click()
      await page.getByText('Compartilhado.').first().waitFor()
      const comp = await page.evaluate(() => window.__compartilhados)
      igual(String(comp.length), '1', 'compartilhamentos')
      esperar(comp[0].text.includes('12:17'), 'chegada no texto compartilhado')
    })

    await passo('a mensagem do restaurante não grava evento na timeline', async () => {
      esperar(!(await lerBanco(page, 'eventos')).some((e) => e.tipo === 'atualizacao_gerada'), 'não deveria gravar atualização')
    })

    await passo('EDITAR abre a prévia; equipe 3 refaz o texto para 41 pessoas', async () => {
      await blocoA().getByRole('button', { name: 'EDITAR' }).click()
      await page.locator('#mensagem-texto').waitFor()
      esperar((await textoPrevia(page)).includes('grupo de 38 pessoas'), 'prévia do restaurante')
      await dialogoAberto(page).getByRole('button', { name: 'Identificação e equipe' }).click()
      await page.locator('#dados-equipe').fill('3')
      await dialogoAberto(page).getByRole('button', { name: 'Salvar' }).click()
      await page.waitForFunction(() => document.querySelector('#mensagem-texto')?.value.includes('grupo de 41 pessoas'))
      await dialogoAberto(page).getByRole('button', { name: 'COPIAR' }).click()
      await page.getByText('Copiado. Agora é só colar na conversa.').waitFor()
      esperar((await page.evaluate(() => navigator.clipboard.readText())).includes('41 pessoas'), 'copiado com a equipe')
      await dialogoAberto(page).getByRole('button', { name: 'Fechar', exact: true }).click()
      esperar((await blocoA().locator('.texto-mensagem').innerText()).includes('41 pessoas'), 'bloco atualizado com a equipe')
      esperar(!(await lerBanco(page, 'eventos')).some((e) => e.tipo === 'atualizacao_gerada'), 'a prévia do restaurante não grava atualização')
    })

    await passo('sem passageiros e sem equipe, a mensagem some e aparece a dica; o LIGAR continua', async () => {
      await apagarDoBanco(page, 'passageiros')
      const viagens = await lerBanco(page, 'viagens')
      await page.evaluate(
        (v) =>
          new Promise((resolve) => {
            const r = indexedDB.open('bordo-demo')
            r.onsuccess = () => {
              const db = r.result
              const tx = db.transaction('viagens', 'readwrite')
              tx.objectStore('viagens').put({ ...v, equipe: 0 })
              tx.oncomplete = () => (db.close(), resolve(true))
            }
          }),
        viagens[0],
      )
      await voltar(page)
      await h.abrirAlternativas(page)
      await page.getByText('Cadastre os passageiros ou informe a equipe para gerar a mensagem.').first().waitFor()
      igual(String(await page.getByRole('button', { name: 'COPIAR' }).count()), '0', 'botões COPIAR')
      esperar(await alternativa('Restaurante B').getByRole('link', { name: 'LIGAR' }).isVisible(), 'LIGAR sumiu')
    })
    await ctx.close()
  },
}
