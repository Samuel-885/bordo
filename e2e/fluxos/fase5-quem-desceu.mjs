export const fluxo = {
  nome: 'Fase 5: quem desceu (folha ao CHEGAMOS, marcação e efeito na conferência)',
  async executar(h) {
    const { esperar, igual, passo, botao, abrirDemo, escolherCenario, defineRelogio, lerBanco, dialogoAberto } = h
    const nome = (n) => `Passageiro fictício ${String(n).padStart(2, '0')}`

    // Em viagem para Monlevade (06:47 → 08:55), com a chegada feita pelo botão, para a folha abrir sozinha.
    async function chegarEmMonlevade() {
      const { ctx, page } = await h.novaPagina()
      await abrirDemo(page)
      await escolherCenario(page, 'Saída atrasada')
      await defineRelogio(page, '08:55')
      await botao(page, 'CHEGAMOS').click()
      await page.getByRole('heading', { name: 'Quem desceu?' }).waitFor()
      return { ctx, page }
    }

    {
      const { ctx, page } = await chegarEmMonlevade()

      await passo('abre sozinha ao CHEGAMOS num ponto obrigatório, com "Agora não"', async () => {
        esperar(await botao(page, 'Agora não').isVisible(), 'Agora não ausente')
        esperar(await botao(page, 'Escolher nomes').isVisible(), 'Escolher nomes ausente')
        esperar(await botao(page, 'Todos', { exact: true }).isVisible(), 'Todos ausente')
      })

      await passo('Escolher nomes: lista só quem está a bordo (35) e salva a marcação', async () => {
        await botao(page, 'Escolher nomes').click()
        const itens = dialogoAberto(page).locator('ul[aria-label="Passageiros a bordo"] li button')
        igual(String(await itens.count()), '35', 'passageiros a bordo na lista')
        esperar(!(await dialogoAberto(page).innerText()).includes(nome(36)), 'quem embarca ali não deveria aparecer')
        await dialogoAberto(page).locator('li button', { hasText: nome(1) }).click()
        await dialogoAberto(page).locator('li button', { hasText: nome(2) }).click()
        await botao(page, 'Salvar (2 desceram)').click()
        await page.getByText('Desceram: 2').waitFor()
        const marcacao = (await lerBanco(page, 'eventos')).find((e) => e.tipo === 'desceram')
        igual(marcacao.dados.passageiroIds.sort().join(','), 'demo-p-01,demo-p-02', 'ids marcados')
        igual(marcacao.dados.local, 'etapa', 'local da marcação')
      })

      await passo('na conferência da saída só quem desceu fica pendente (e quem embarca ali), com o aviso', async () => {
        await botao(page, 'SAÍMOS').click()
        await page.getByText('Saída de Ponto de embarque').waitFor()
        await page.getByText('2 desceram, 33 ficaram no ônibus.').waitFor()
        const quadro = await page.locator('section[aria-label="Situação da conferência"]').innerText()
        esperar(quadro.includes('33/38'), `quadro inesperado: ${quadro}`)
        esperar(quadro.includes(nome(1)) && quadro.includes(nome(36)), `pendentes inesperados: ${quadro}`)
      })

      await passo('trocar o modo tira o aviso e reinicia a lista', async () => {
        // O modo já selecionado ("só alguns") não faz nada: o aviso e a lista ficam como estão.
        await botao(page, 'Só alguns').click()
        esperar(await page.getByText('2 desceram, 33 ficaram no ônibus.').isVisible(), 'tocar no mesmo modo não deveria tirar o aviso')
        await botao(page, 'Todos desceram').click()
        esperar(!(await page.getByText('2 desceram, 33 ficaram no ônibus.').isVisible().catch(() => false)), 'o aviso deveria sair ao trocar de modo')
        const quadro = page.locator('section[aria-label="Situação da conferência"]')
        esperar((await quadro.innerText()).includes('0/38'), 'todos deveriam estar pendentes')
        await botao(page, 'Só alguns').click()
        esperar((await quadro.innerText()).includes('35/38'), 'a lista deveria voltar ao estado de embarque, sem a marcação')
      })
      await ctx.close()
    }

    {
      const { ctx, page } = await chegarEmMonlevade()
      await passo('Agora não fecha a folha sem gravar; o botão do cartão reabre direto na lista', async () => {
        await botao(page, 'Agora não').click()
        await page.waitForTimeout(200)
        esperar(!(await lerBanco(page, 'eventos')).some((e) => e.tipo === 'desceram'), 'não deveria gravar a marcação')
        await botao(page, 'Marcar quem desceu').click()
        // Aberta pelo botão do cartão, a folha vai direto à lista, mesmo sem marcação anterior.
        esperar(await dialogoAberto(page).locator('ul[aria-label="Passageiros a bordo"]').isVisible(), 'a lista deveria abrir direto')
        esperar((await dialogoAberto(page).getByRole('button', { name: 'Escolher nomes' }).count()) === 0, 'não deveria oferecer "Escolher nomes"')
        await dialogoAberto(page).locator('li button', { hasText: nome(3) }).click()
        await botao(page, 'Salvar (1 desceu)').click()
        await page.getByText('Desceram: 1').waitFor()
        await page.waitForTimeout(8500) // o aviso de DESFAZER (8 s) cobre o botão do cartão
      })

      await passo('uma marcação nova na mesma parada substitui a anterior (Todos = 35)', async () => {
        await botao(page, 'Marcar quem desceu').click()
        const lista = dialogoAberto(page).locator('ul[aria-label="Passageiros a bordo"]')
        esperar(await lista.isVisible(), 'com marcação, a folha deveria abrir direto na lista')
        esperar((await dialogoAberto(page).locator('li button[aria-pressed="true"]', { hasText: nome(3) }).count()) === 1, 'a marcação atual deveria vir marcada')
        await botao(page, 'Todos', { exact: true }).click()
        await page.getByText('Desceram: 35').waitFor()
        const marcacoes = (await lerBanco(page, 'eventos')).filter((e) => e.tipo === 'desceram')
        igual(String(marcacoes.length), '2', 'eventos de marcação (os antigos ficam)')
      })

      await passo('DESFAZER devolve a marcação anterior', async () => {
        await botao(page, 'DESFAZER').click()
        await page.getByText('Desceram: 1').waitFor()
      })
      await ctx.close()
    }
  },
}
