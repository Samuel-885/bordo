// Excluir viagem em qualquer status (planejando, em andamento, concluída), pela lista e pela aba
// Mais, com a caixa "Entendo..." nas iniciadas e concluídas; e os locais que só ela usava ficam livres.

export const fluxo = {
  nome: 'Excluir viagem: planejando, em andamento e concluída, pela lista e pela aba Mais',
  async executar(h) {
    const { aguardar, esperar, igual, passo, botao, abrirDemo, escolherCenario, irParaAba, dialogoAberto, lerBanco } = h
    const { ctx, page } = await h.novaPagina()

    const paraALista = async () => {
      await irParaAba(page, 'mais')
      await page.locator('.item-menu', { hasText: 'Trocar de viagem' }).click()
      await botao(page, 'Nova viagem').waitFor()
    }
    const contar = async () => ({
      viagens: (await lerBanco(page, 'viagens')).length,
      etapas: (await lerBanco(page, 'etapas')).length,
      eventos: (await lerBanco(page, 'eventos')).length,
      passageiros: (await lerBanco(page, 'passageiros')).length,
      locais: (await lerBanco(page, 'locais')).length,
    })

    await passo('o botão ⋯ da lista é separado do toque que abre a viagem; tocar na linha não exclui', async () => {
      await abrirDemo(page)
      await paraALista()
      const opcoes = page.getByRole('button', { name: /^Opções de / })
      const caixa = await opcoes.boundingBox()
      esperar(caixa.width >= 44 && caixa.height >= 44, `alvo de toque de ${caixa.width}×${caixa.height}`)
      await opcoes.click()
      await dialogoAberto(page).getByRole('button', { name: 'Excluir viagem' }).waitFor()
      await dialogoAberto(page).getByRole('button', { name: 'Cancelar' }).click()
      igual(String((await contar()).viagens), '1', 'cancelar não exclui')
    })

    await passo('planejando, pela lista: confirmação simples, sem a caixa, e a lista fica vazia', async () => {
      await page.getByRole('button', { name: /^Opções de / }).click()
      await dialogoAberto(page).getByRole('button', { name: 'Excluir viagem' }).click()
      const d = dialogoAberto(page)
      const texto = (await d.innerText()).replace(/\s+/g, ' ')
      esperar(texto.includes('Viagem de demonstração') && texto.includes('14/11/2026') && texto.includes('Planejando'), `nome, data e status: ${texto}`)
      esperar((await d.getByRole('checkbox').count()) === 0, 'em planejamento não pede a caixa')
      await d.getByRole('button', { name: 'Excluir viagem' }).click()
      await page.getByText('Nenhuma viagem ainda').waitFor()
      const c = await contar()
      igual(JSON.stringify([c.viagens, c.etapas, c.eventos, c.passageiros]), '[0,0,0,0]', 'viagem, etapas, eventos e passageiros apagados')
      igual(String(c.locais), '8', 'os locais do catálogo ficam')
    })

    await passo('em andamento, pela aba Mais: o botão só liga depois da caixa "Entendo..."; apaga tudo e volta à lista', async () => {
      await abrirDemo(page)
      await escolherCenario(page, 'Saída atrasada', 2)
      esperar((await contar()).eventos > 0 && (await contar()).passageiros === 38, 'a viagem tem registros e 38 passageiros')
      await irParaAba(page, 'mais')
      await page.locator('.item-menu', { hasText: 'Excluir viagem' }).click()
      const d = dialogoAberto(page)
      const texto = (await d.innerText()).replace(/\s+/g, ' ')
      esperar(texto.includes('Em andamento') && texto.includes('14/11/2026') && !texto.includes('backup'), `nome, data e status (a demonstração não tem backup): ${texto}`)
      const excluir = d.getByRole('button', { name: 'Excluir viagem' })
      esperar(await excluir.isDisabled(), 'sem a caixa, o botão fica desligado')
      await d.getByRole('checkbox', { name: /Entendo que os registros serão apagados/ }).check()
      esperar(await excluir.isEnabled(), 'com a caixa, o botão liga')
      await excluir.click()
      await page.getByText('Nenhuma viagem ainda').waitFor()
      const c = await contar()
      igual(JSON.stringify([c.viagens, c.etapas, c.eventos, c.passageiros]), '[0,0,0,0]', 'tudo da viagem apagado')
      igual(String((await lerBanco(page, 'trechos')).length), '0', 'trechos apagados')
    })

    await passo('concluída, pela lista: pede a caixa; depois, os locais que só ela usava podem ser excluídos', async () => {
      await abrirDemo(page)
      await escolherCenario(page, 'Chegada ao destino')
      await paraALista()
      // Com a viagem, o local está em uso e a mensagem diz a data e o status da viagem.
      await botao(page, 'LOCAIS').click()
      await botao(page, 'Excluir Restaurante A').click()
      const uso = (await dialogoAberto(page).innerText()).replace(/\s+/g, ' ')
      esperar(uso.includes('Viagem de demonstração (14/11/2026, Concluída)'), `uso do local: ${uso}`)
      await dialogoAberto(page).getByRole('button', { name: 'Entendi' }).click()
      await h.voltar(page)
      await page.getByRole('button', { name: /^Opções de / }).click()
      await dialogoAberto(page).getByRole('button', { name: 'Excluir viagem' }).click()
      const d = dialogoAberto(page)
      esperar((await d.innerText()).includes('Concluída'), 'o status aparece')
      esperar(await d.getByRole('button', { name: 'Excluir viagem' }).isDisabled(), 'concluída pede a caixa')
      await d.getByRole('checkbox').check()
      await d.getByRole('button', { name: 'Excluir viagem' }).click()
      await page.getByText('Nenhuma viagem ainda').waitFor()
      await botao(page, 'LOCAIS').click()
      await botao(page, 'Excluir Restaurante A').click()
      await dialogoAberto(page).getByRole('button', { name: 'Excluir' }).click()
      await aguardar(async () => !(await lerBanco(page, 'locais')).some((l) => l.nome === 'Restaurante A'), true, 'o local livre foi excluído')
    })

    await ctx.close()

    await passo('no espaço real, a viagem iniciada sugere o backup antes e só exclui depois da caixa', async () => {
      const { ctx: ctxR, page: r } = await h.novaPagina({ relogioReal: '2026-11-14T10:05:00-03:00' })
      await abrirDemo(r)
      await escolherCenario(r, 'Saída atrasada', 2)
      await h.copiarDemoParaReal(r)
      await r.goto(r.url())
      await irParaAba(r, 'mais')
      await r.locator('.item-menu', { hasText: 'Excluir viagem' }).click()
      const d = dialogoAberto(r)
      const texto = (await d.innerText()).replace(/\s+/g, ' ')
      esperar(texto.includes('faça o backup antes') && texto.includes('COMPARTILHAR BACKUP'), `sugestão de backup: ${texto}`)
      esperar(await d.getByRole('button', { name: 'Excluir viagem' }).isDisabled(), 'desligado sem a caixa')
      await d.getByRole('checkbox').check()
      await d.getByRole('button', { name: 'Excluir viagem' }).click()
      await r.getByText('Nenhuma viagem ainda').waitFor()
      await ctxR.close()
    })
  },
}
