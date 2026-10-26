// Correções dos testes reais no celular (viagem urbana curta). Um passo por correção.

export const fluxo = {
  nome: 'Correções do teste no celular: trocar de viagem, encerrada, espaço do rodapé',
  async executar(h) {
    const { aguardar, esperar, igual, passo, botao, abrirDemo, escolherCenario, irParaAba, copiarDemoParaReal, dialogoAberto } = h
    const { ctx, page } = await h.novaPagina()

    const naLista = async () => {
      await botao(page, 'Nova viagem').waitFor()
      esperar(!(await page.locator('.barra-abas').isVisible()), 'a lista de viagens não tem a barra de abas')
    }
    const trocarDeViagemAposAbas = async () => {
      await irParaAba(page, 'roteiro')
      await irParaAba(page, 'pessoas')
      await irParaAba(page, 'mais')
      await page.locator('.item-menu', { hasText: 'Trocar de viagem' }).click()
      await naLista()
    }

    await passo('Trocar de viagem no planejamento, depois de passar por três abas, volta à lista', async () => {
      await abrirDemo(page)
      await trocarDeViagemAposAbas()
    })

    await passo('Trocar de viagem em viagem em andamento volta à lista', async () => {
      await abrirDemo(page)
      await escolherCenario(page, 'Saída atrasada', 2)
      await trocarDeViagemAposAbas()
    })

    await passo('Viagem encerrada: o cartão mostra quantos chegaram, nas abas Viagem e Pessoas', async () => {
      await abrirDemo(page)
      await escolherCenario(page, 'Chegada ao destino')
      const cartao = page.locator('[data-teste="cartao-a-bordo"]')
      igual((await cartao.locator('h2').innerText()).trim().toLowerCase(), 'chegaram', 'título do cartão')
      esperar(/^\d+ passageiros$/.test((await cartao.locator('.valor').innerText()).trim()), 'o valor é "N passageiros", não "—"')
      await irParaAba(page, 'pessoas')
      const resumo = page.locator('[aria-label="A bordo"]')
      esperar(/chegaram/i.test(await resumo.innerText()) && /\d+ passageiros/.test(await resumo.innerText()), 'a aba Pessoas também mostra quantos chegaram')
      await irParaAba(page, 'viagem')
    })

    await passo('Trocar de viagem em viagem concluída volta à lista, e a lista fica na primeira entrada do histórico', async () => {
      await abrirDemo(page)
      await escolherCenario(page, 'Chegada ao destino')
      await trocarDeViagemAposAbas()
      igual(String(await page.evaluate(() => history.state?.indice)), '0', 'a lista é a primeira entrada do histórico (as abas não ficam atrás dela)')
    })

    await ctx.close()

    await passo('Previsão no último trecho: em trânsito para o destino o botão está ligado e o horário vira a chegada prevista', async () => {
      const { ctx: ctxD, page: d } = await h.novaPagina()
      await abrirDemo(d)
      // Até o SAÍMOS do jantar (21:37): em viagem, e a próxima parada é o destino.
      await escolherCenario(d, 'Chegada ao destino', 18)
      await d.getByText('Próxima parada').first().waitFor()
      const previsao = botao(d, 'Previsão', { exact: true })
      esperar(await previsao.isEnabled(), 'o botão Previsão deve estar ligado quando o destino é a próxima etapa')
      await previsao.click()
      await d.locator('#recalibracao-hora').fill('23:55')
      await dialogoAberto(d).getByRole('button', { name: 'Atualizar', exact: true }).click()
      await d.getByText('Google Maps, informado às 21:37').first().waitFor()
      const destaque = (await d.locator('[aria-label="Previsão no destino"]').innerText()).replace(/\s+/g, ' ')
      esperar(destaque.includes('23:55'), `chegada no destino: ${destaque}`)
      const eventos = (await h.lerBanco(d, 'eventos')).filter((e) => e.tipo === 'recalibracao')
      igual(eventos.map((e) => e.etapaId).join(','), 'demo-destino', 'a recalibração é do destino')
      await ctxD.close()
    })

    await passo('Trecho calculado pela rota: o cartão diz "Estimativa pela rota, sem trânsito", e Atualizar previsão aparece ali', async () => {
      const { ctx: ctxF, page: f } = await h.novaPagina({ relogioReal: '2026-11-14T21:40:00-03:00' })
      await abrirDemo(f)
      await escolherCenario(f, 'Chegada ao destino', 18)
      // Último trecho sem horário de roteiro e com tempo de rota (60 min de carro × 1,15 = 1h09).
      const etapas = await h.lerBanco(f, 'etapas')
      const { chegadaRoteiro, ...destino } = etapas.find((x) => x.id === 'demo-destino')
      await h.escreverBanco(f, 'etapas', destino)
      await h.escreverBanco(f, 'trechos', { etapaOrigemId: 'demo-jantar', localOrigemId: 'demo-l-jantar', etapaDestinoId: 'demo-destino', localDestinoId: 'demo-l-chegada', duracaoMin: 60, fonte: 'rota', distanciaKm: 30, calculadoEm: '2026-11-13T10:00:00-03:00' })
      await copiarDemoParaReal(f)
      await f.goto(f.url())
      const cartao = f.locator('[aria-label="Próxima parada"]')
      await cartao.waitFor()
      const texto = (await cartao.innerText()).replace(/\s+/g, ' ')
      esperar(texto.includes('Estimativa pela rota, sem trânsito'), `cartão da próxima parada: ${texto}`)
      esperar(/22:46/.test(await f.locator('[aria-label="Previsão no destino"]').innerText()), 'chegada no destino 21:37 + 1h09')
      esperar((await f.locator('[aria-label="Previsão no destino"]').innerText()).includes('Estimativa pela rota, sem trânsito'), 'origem no cartão do destino')
      await cartao.getByRole('button', { name: /Atualizar previsão/ }).click()
      await f.locator('#recalibracao-hora').fill('22:24')
      await dialogoAberto(f).getByRole('button', { name: 'Atualizar', exact: true }).click()
      await f.getByText(/Google Maps, informado às/).first().waitFor()
      esperar(!(await cartao.innerText()).includes('Estimativa pela rota'), 'depois da recalibração, a linha de estimativa some')
      await ctxF.close()
    })

    await passo('Busca de endereço: selo exato ou aproximado, dica ao escolher aproximado e preferência por resultados perto dos locais', async () => {
      const { ctx: ctxG, page: g } = await h.novaPagina()
      const pedidas = []
      await ctxG.route('https://photon.komoot.io/**', (rota) => {
        pedidas.push(rota.request().url())
        const feature = (properties, lng, lat) => ({ type: 'Feature', properties: { city: 'Ipatinga', state: 'Minas Gerais', ...properties }, geometry: { type: 'Point', coordinates: [lng, lat] } })
        return rota.fulfill({
          status: 200,
          headers: { 'access-control-allow-origin': '*' },
          contentType: 'application/json',
          body: JSON.stringify({
            type: 'FeatureCollection',
            features: [
              feature({ name: 'Shopping Exemplo', type: 'house', osm_key: 'shop', osm_value: 'mall' }, -42.56, -19.49),
              feature({ name: 'Prédio Exemplo', street: 'Rua Fictícia', housenumber: '120', type: 'house', osm_key: 'building' }, -42.55, -19.47),
              feature({ name: 'Rua Fictícia', type: 'street', osm_key: 'highway' }, -42.54, -19.46),
            ],
          }),
        })
      })
      await abrirDemo(g)
      // Dois locais com coordenadas: o centro é (-20.32, -45.17).
      const locais = await h.lerBanco(g, 'locais')
      await h.escreverBanco(g, 'locais', { ...locais.find((l) => l.id === 'demo-l-saida'), coordenadas: { lat: -19.4687, lng: -42.5367 } })
      await h.escreverBanco(g, 'locais', { ...locais.find((l) => l.id === 'demo-l-chegada'), coordenadas: { lat: -21.1775, lng: -47.8103 } })
      await irParaAba(g, 'locais')
      await botao(g, 'Novo local').click()
      await g.locator('#l-busca').fill('rua ficticia 120')
      await botao(g, 'Buscar', { exact: true }).click()
      const lista = g.getByRole('list', { name: 'Resultados da busca' })
      await lista.waitFor()
      igual(pedidas[0], 'https://photon.komoot.io/api/?q=rua%20ficticia%20120&limit=5&lat=-20.32&lon=-45.17', 'URL com o viés de proximidade')
      const botoes = lista.getByRole('button')
      igual((await botoes.nth(0).innerText()).replace(/\s+/g, ' '), 'Shopping Exemplo Ipatinga, Minas Gerais Estabelecimento · exato', 'estabelecimento')
      igual((await botoes.nth(1).innerText()).replace(/\s+/g, ' '), 'Prédio Exemplo Ipatinga, Minas Gerais Endereço com número · exato', 'endereço com número')
      igual((await botoes.nth(2).innerText()).replace(/\s+/g, ' '), 'Rua Fictícia Ipatinga, Minas Gerais Rua · aproximado', 'rua')
      await botoes.nth(0).click()
      esperar(!(await g.locator('[data-teste="dica-aproximado"]').isVisible()), 'resultado exato não mostra a dica')
      await g.locator('#l-busca').fill('rua ficticia')
      await botao(g, 'Buscar', { exact: true }).click()
      await lista.waitFor()
      await botoes.nth(2).click()
      const dica = await g.locator('[data-teste="dica-aproximado"]').innerText()
      esperar(dica.includes('aproximado') && dica.includes('coordenadas do Google Maps'), `dica: ${dica}`)
      await ctxG.close()
    })

    await passo('Parado no jantar (etapa anterior ao destino): Mais › Atualizar previsão aceita a chegada no destino', async () => {
      const { ctx: ctxE, page: e } = await h.novaPagina()
      await abrirDemo(e)
      await escolherCenario(e, 'Chegada ao destino', 17)
      await e.getByText('Parados em').first().waitFor()
      // Parado, a ação fica em Mais › Registros (o rodapé de parada não tem o botão Previsão).
      await irParaAba(e, 'mais')
      await e.locator('.item-menu', { hasText: 'Atualizar previsão' }).click()
      await e.locator('#recalibracao-hora').fill('23:59')
      await dialogoAberto(e).getByRole('button', { name: 'Atualizar', exact: true }).click()
      await e.getByText(/Previsão atualizada para 23:59/).waitFor()
      const eventos = (await h.lerBanco(e, 'eventos')).filter((x) => x.tipo === 'recalibracao')
      igual(eventos.map((x) => x.etapaId).join(','), 'demo-destino', 'a recalibração é do destino')
      await ctxE.close()
    })

    await passo('o cartão de sugestão de backup, no fim da aba Viagem, fica acima do rodapé e do aviso DESFAZER', async () => {
      const { ctx: ctxB, page: b } = await h.novaPagina({ relogioReal: '2026-11-14T10:05:00-03:00' })
      await abrirDemo(b)
      await escolherCenario(b, 'Saída atrasada', 2)
      await copiarDemoParaReal(b)
      await b.goto(b.url())
      const sugestao = b.locator('[data-teste="sugestao-backup"]')
      await sugestao.waitFor()
      // Distância do fim do cartão ao que está fixo por cima dele (rodapé e, quando aparece, o aviso).
      const folga = () =>
        b.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight)
          const fim = document.querySelector('[data-teste="sugestao-backup"]').getBoundingClientRect().bottom
          const topo = Math.min(
            document.querySelector('.rodape-fixo').getBoundingClientRect().top,
            document.querySelector('.aviso-desfazer')?.getBoundingClientRect().top ?? Infinity,
          )
          return topo - fim
        })
      await aguardar(folga, (f) => f >= 8, 'folga sem aviso (px)')
      // Um registro mostra o aviso DESFAZER por 8 s; a sugestão continua na tela (em viagem, depois da saída).
      await botao(b, 'Previsão', { exact: true }).click()
      await b.locator('#recalibracao-hora').fill('11:00')
      await dialogoAberto(b).getByRole('button', { name: 'Atualizar', exact: true }).click()
      await b.locator('.aviso-desfazer').waitFor()
      await aguardar(folga, (f) => f >= 8, 'folga com o aviso DESFAZER (px)')
      await ctxB.close()
    })
  },
}
