// Redesenho: as cinco abas, a ação principal por situação (e a barra compacta nas outras abas),
// o selo online/offline, o catálogo de locais, os tamanhos mínimos e o modo noite (automático
// pelo relógio simulado e manual).

export const fluxo = {
  nome: 'Redesenho: abas, ação principal por situação, barra compacta, locais e modo noite',
  async executar(h) {
    const { aguardar, esperar, igual, passo, botao, irParaAba, dialogoAberto, abrirDemo, escolherCenario, defineRelogio, lerBanco, tiposDosEventos } = h
    const { ctx, page } = await h.novaPagina()
    await abrirDemo(page)
    // Saída atrasada: saímos de Ipatinga às 06:47, em viagem para o ponto de embarque.
    await escolherCenario(page, 'Saída atrasada', 2)

    const tema = () => page.locator('html').getAttribute('data-tema')
    const abas = page.locator('.barra-abas .aba')
    const compacta = page.locator('[data-teste="barra-compacta"]')
    const naoAgora = async () => {
      const b = botao(page, 'Agora não')
      if (await b.isVisible().catch(() => false)) await b.click()
    }

    await passo('cinco abas na barra de baixo, com ícone e texto; a faixa da demonstração fica visível em todas', async () => {
      igual((await abas.allInnerTexts()).map((t) => t.trim()).join(','), 'Viagem,Roteiro,Pessoas,Locais,Mais', 'abas')
      igual(String(await page.locator('.barra-abas .aba svg').count()), '5', 'ícones')
      igual(await page.locator('.aba[aria-current="page"]').innerText(), 'Viagem', 'aba atual')
      for (const aba of ['viagem', 'roteiro', 'pessoas', 'locais', 'mais']) {
        await irParaAba(page, aba)
        esperar(await page.getByText('MODO DEMONSTRAÇÃO').isVisible(), `faixa da demonstração some na aba ${aba}`)
      }
      await irParaAba(page, 'viagem')
    })

    await passo('aba Viagem: cartão de destaque, próxima parada, a bordo e o rodapé com CHEGAMOS e três ações rápidas', async () => {
      const destaque = (await page.locator('.cartao.destaque').innerText()).replace(/\s+/g, ' ')
      esperar(destaque.includes('Chegada em Ribeirão Preto') && destaque.includes('23:47') && destaque.includes('original 23:30') && destaque.includes('+17 min'), `cartão de destaque: ${destaque}`)
      esperar((await page.locator('section[aria-label="Próxima parada"]').innerText()).includes('Ponto de embarque'), 'próxima parada')
      esperar((await page.locator('[data-teste="cartao-a-bordo"]').innerText()).includes('35/35 a bordo'), 'cartão A bordo')
      esperar(!(await page.locator('[data-teste="linha-backup"]').isVisible()), 'a demonstração não tem cartão de último backup')
      igual((await page.locator('.barra-acao .botao-principal').innerText()).trim(), 'CHEGAMOS', 'ação principal')
      igual((await page.locator('.acoes-rapidas button').allInnerTexts()).join(','), 'PARAMOS,Previsão,Mensagem', 'ações rápidas em viagem')
      esperar(!(await compacta.isVisible()), 'a barra compacta só aparece fora da aba Viagem')
    })

    await passo('tamanhos: textos de 13 px ou mais, ação principal de 68 px e áreas de toque de 44 px', async () => {
      for (const aba of ['viagem', 'roteiro', 'pessoas', 'locais', 'mais']) {
        await irParaAba(page, aba)
        const menores = await page.evaluate(() => {
          const achados = []
          const raiz = document.querySelector('#root')
          for (const el of raiz.querySelectorAll('*')) {
            const tem = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
            if (tem && parseFloat(getComputedStyle(el).fontSize) < 13) achados.push(`${el.tagName}.${el.className}:${getComputedStyle(el).fontSize}`)
          }
          return achados
        })
        igual(menores.join(' | '), '', `textos abaixo de 13 px na aba ${aba}`)
        const baixos = await page.evaluate(() =>
          [...document.querySelectorAll('.barra-acao button, .barra-abas button, .item-menu, .segmento')].filter((b) => b.getBoundingClientRect().height < 44 - 0.5).map((b) => b.textContent.trim()),
        )
        igual(baixos.join(' | '), '', `áreas de toque abaixo de 44 px na aba ${aba}`)
      }
      await irParaAba(page, 'viagem')
      const alturaPrincipal = await page.locator('.barra-acao .botao-principal').evaluate((b) => b.getBoundingClientRect().height)
      esperar(alturaPrincipal >= 67 && alturaPrincipal <= 70, `ação principal com ${alturaPrincipal} px`)
      const tamanho = await page.locator('.barra-acao .botao-principal').evaluate((b) => getComputedStyle(b).fontSize)
      igual(tamanho, '26px', 'texto da ação principal')
      igual(await page.locator('.hora-grande .mono').evaluate((b) => getComputedStyle(b).fontSize), '54px', 'horário grande')
    })

    await passo('aba Roteiro: Paradas com marcadores, alternativas da próxima parada flexível abertas e Mapa ligado', async () => {
      await irParaAba(page, 'roteiro')
      igual(await page.locator('[data-teste="parada"][data-marcador="feita"]').count().then(String), '1', 'paradas feitas (a origem)')
      igual(await page.locator('[data-teste="parada"][data-marcador="proxima"]').innerText().then((t) => t.split('\n')[0]), 'Ponto de embarque', 'próxima')
      igual(String(await page.locator('[data-teste="alternativa-resumo"]').count()), '3', 'alternativas abertas sob a parada flexível')
      esperar((await page.locator('[data-teste="alternativa-resumo"]').first().innerText()).includes('Viável'), 'classificação')
      esperar(await botao(page, 'Mapa', { exact: true }).isEnabled(), 'Mapa deveria estar ligado')
      await page.getByRole('tab', { name: 'Timeline' }).click()
      await page.getByText('Viagem iniciada').first().waitFor()
      await page.getByRole('tab', { name: 'Paradas' }).click()
    })

    await passo('a barra compacta aparece nas outras abas, com a previsão do destino e a mesma ação principal', async () => {
      for (const aba of ['roteiro', 'pessoas', 'locais', 'mais']) {
        await irParaAba(page, aba)
        const t = (await compacta.innerText()).replace(/\s+/g, ' ')
        esperar(t.includes('CHEGAMOS') && t.includes('23:47') && t.includes('+17 min'), `barra compacta na aba ${aba}: ${t}`)
        const h2 = await compacta.locator('.botao-principal').evaluate((b) => b.getBoundingClientRect().height)
        esperar(h2 >= 51 && h2 <= 54, `ação principal compacta com ${h2} px`)
      }
    })

    await passo('CHEGAMOS pela barra compacta (aba Locais) registra a chegada; a aba Viagem passa a SAÍMOS com o cronômetro', async () => {
      await irParaAba(page, 'locais')
      await compacta.getByRole('button', { name: 'CHEGAMOS' }).click()
      await page.getByText('Chegada registrada').waitFor()
      await naoAgora()
      esperar((await tiposDosEventos(page)).includes('chegada'), 'a chegada deveria estar gravada')
      igual((await compacta.locator('.botao-principal').innerText()).trim(), 'SAÍMOS', 'compacta depois da chegada')
      await irParaAba(page, 'viagem')
      igual((await page.locator('.barra-acao .botao-principal').innerText()).trim(), 'SAÍMOS', 'principal parado')
      igual((await page.locator('.acoes-rapidas button').allInnerTexts()).join(','), 'Quem desceu,Observação,Mensagem', 'ações rápidas parado')
      const cron = await page.locator('section[aria-label="Cronômetro da parada"]').innerText()
      esperar(/para sair/.test(cron) && cron.includes('Planejado'), `cronômetro: ${cron}`)
      await page.locator('[role="progressbar"]').waitFor()
    })

    await passo('DESFAZER volta a CHEGAMOS e PARAMOS troca a ação principal para VOLTAMOS', async () => {
      await botao(page, 'DESFAZER').click()
      await aguardar(async () => (await page.locator('.barra-acao .botao-principal').innerText()).trim(), 'CHEGAMOS', 'depois do desfazer')
      await botao(page, 'PARAMOS', { exact: true }).click()
      await dialogoAberto(page).getByRole('button', { name: 'Registrar parada' }).click()
      await page.getByRole('heading', { name: 'Quem desceu?' }).waitFor()
      await botao(page, 'Agora não').click()
      igual((await page.locator('.barra-acao .botao-principal').innerText()).trim(), 'VOLTAMOS', 'principal na parada não planejada')
      igual((await page.locator('.acoes-rapidas button').allInnerTexts()).join(','), 'Quem desceu,Observação,Mensagem', 'ações rápidas na parada não planejada')
      await irParaAba(page, 'mais')
      igual((await compacta.locator('.botao-principal').innerText()).trim(), 'VOLTAMOS', 'compacta na parada não planejada')
      await botao(page, 'DESFAZER').click().catch(() => {})
    })

    await passo('aba Mais: três grupos, Relatório ligado e Backup ausente na demonstração', async () => {
      await irParaAba(page, 'mais')
      for (const g of ['Comunicação', 'Registros', 'Dados e aparelho']) await page.locator(`section[aria-label="${g}"]`).waitFor()
      const itens = (await page.locator('.item-menu strong').allInnerTexts()).map((t) => t.trim())
      for (const i of ['Mensagem de atualização', 'Modelos de mensagem', 'Registrar imprevisto', 'Observação', 'Relatório', 'Modo noite', 'Demonstração'].filter((x) => x !== 'Modo noite' && x !== 'Demonstração'))
        esperar(itens.includes(i), `falta "${i}" em Mais: ${itens}`)
      esperar(await page.locator('.item-menu', { hasText: 'Relatório' }).isEnabled(), 'Relatório deveria estar ligado')
      esperar((await page.locator('.item-menu', { hasText: 'Relatório' }).innerText()).includes('PDF'), 'dica do relatório')
      esperar(!itens.includes('Backup'), 'a demonstração não tem Backup')
      esperar(itens.includes('Sair da demonstração') && itens.includes('Trocar de viagem'), `itens de dados e aparelho: ${itens}`)
    })

    await passo('aba Locais: em uso não exclui (diz onde está usado); novo, editar e excluir um local livre', async () => {
      await irParaAba(page, 'locais')
      await botao(page, 'Excluir Restaurante A').click()
      const emUso = dialogoAberto(page)
      await emUso.getByRole('heading', { name: 'Local em uso' }).waitFor()
      const texto = await emUso.innerText()
      esperar(texto.includes('Viagem de demonstração') && texto.includes('(preferido)'), `onde está em uso: ${texto}`)
      await emUso.getByRole('button', { name: 'Entendi' }).click()
      esperar((await lerBanco(page, 'locais')).some((l) => l.nome === 'Restaurante A'), 'o local em uso não pode sair do catálogo')

      await botao(page, 'Novo local').click()
      await page.locator('#l-nome').fill('Posto fictício')
      await page.locator('#l-cidade').fill('Cidade X')
      await botao(page, 'Salvar local').click()
      await page.getByRole('button', { name: 'Editar Posto fictício' }).waitFor()
      await botao(page, 'Editar Posto fictício').click()
      igual(await page.locator('#l-nome').inputValue(), 'Posto fictício', 'formulário de edição preenchido')
      await page.locator('#l-nome').fill('Posto fictício 2')
      await botao(page, 'Salvar local').click()
      await page.getByRole('button', { name: 'Editar Posto fictício 2' }).waitFor()
      esperar((await lerBanco(page, 'locais')).some((l) => l.nome === 'Posto fictício 2'), 'edição não gravada')
      await botao(page, 'Excluir Posto fictício 2').click()
      await dialogoAberto(page).getByRole('heading', { name: 'Excluir local?' }).waitFor()
      await dialogoAberto(page).getByRole('button', { name: 'Excluir', exact: true }).click()
      await aguardar(async () => !(await lerBanco(page, 'locais')).some((l) => l.nome.startsWith('Posto fictício')), true, 'o local livre deveria ter sido excluído')
    })

    await passo('selo de rede: "Online" e, sem conexão, "Sem internet"', async () => {
      igual((await page.locator('[data-teste="selo-rede"]').innerText()).trim(), 'Online', 'selo online')
      await ctx.setOffline(true)
      await page.getByText('Sem internet', { exact: true }).waitFor()
      esperar((await page.locator('[data-teste="selo-rede"]').getAttribute('class')).includes('offline'), 'classe offline')
      await ctx.setOffline(false)
      await page.getByText('Online', { exact: true }).waitFor()
    })

    await passo('modo noite automático pelo relógio simulado: 18:30 escuro, 05:30 escuro, 06:00 e meio-dia claro', async () => {
      await irParaAba(page, 'viagem')
      igual(await tema(), 'claro', 'de manhã')
      await defineRelogio(page, '18:30')
      igual(await tema(), 'escuro', '18:30')
      await defineRelogio(page, '05:30')
      igual(await tema(), 'escuro', '05:30')
      await defineRelogio(page, '06:00')
      igual(await tema(), 'claro', '06:00')
      await defineRelogio(page, '12:00')
      igual(await tema(), 'claro', '12:00')
      await defineRelogio(page, '18:00')
      igual(await tema(), 'escuro', '18:00')
      igual(await page.locator('meta[name="theme-color"]').getAttribute('content'), '#0e1513', 'cor do navegador à noite')
    })

    await passo('modo noite manual em Mais: Sempre claro à noite, Sempre escuro de dia e Automático; fica guardado no aparelho', async () => {
      await irParaAba(page, 'mais')
      const opcao = (nome) => page.getByRole('radio', { name: nome })
      await opcao('Sempre claro').click()
      igual(await tema(), 'claro', 'sempre claro às 18:00')
      igual(await page.evaluate(() => localStorage.getItem('bordo:tema')), 'claro', 'guardado: claro')
      await defineRelogio(page, '12:00')
      igual(await tema(), 'claro', 'sempre claro ao meio-dia')
      await opcao('Sempre escuro').click()
      igual(await tema(), 'escuro', 'sempre escuro ao meio-dia')
      igual(await page.evaluate(() => localStorage.getItem('bordo:tema')), 'escuro', 'guardado: escuro')
      await opcao('Automático').click()
      igual(await tema(), 'claro', 'automático ao meio-dia')
      esperar(await opcao('Automático').getAttribute('aria-checked') === 'true', 'Automático deveria estar marcado')
      igual((await lerBanco(page, 'meta').catch(() => [])).some((m) => String(m.chave ?? '').includes('tema')) ? 'no banco' : 'fora do banco', 'fora do banco', 'a preferência não vai para o banco')
    })

    await ctx.close()
  },
}
