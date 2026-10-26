// Fase 9, parte 2: o botão "Mapa" da aba Roteiro. Tiles do OpenStreetMap e GPS simulados:
// nenhuma chamada sai para a internet. As coordenadas são fictícias e entram pelo formulário de
// local (a demonstração não traz coordenadas).

const CORS = { 'access-control-allow-origin': '*' }
const TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
const POSICAO = { latitude: -19.15, longitude: -42.15 }

/** Todos com coordenadas, menos "Restaurante C" (alternativa) e "Restaurante do jantar". */
const COORDENADAS = {
  'Ponto de saída': '-19.0, -42.0',
  'Ponto de embarque': '-19.1, -42.1',
  'Restaurante A': '-19.2, -42.2',
  'Restaurante B': '-19.25, -42.3',
  'Lanchonete do café': '-19.5, -42.5',
  'Ponto de chegada': '-19.7, -42.7',
}

export const fluxo = {
  nome: 'Fase 9: mapa do roteiro (tiles e GPS simulados)',
  async executar(h) {
    const { esperar, igual, aguardar, passo, botao, irParaAba, abrirDemo, escolherCenario, lerBanco } = h
    const { ctx, page } = await h.novaPagina()
    const origem = h.base.replace(/\/$/, '')
    await ctx.grantPermissions(['geolocation'], { origin: origem })
    await ctx.setGeolocation({ ...POSICAO, accuracy: 25 })
    const tiles = []
    await ctx.route('https://tile.openstreetmap.org/**', (rota) => {
      tiles.push(rota.request().url())
      return rota.fulfill({ status: 200, headers: CORS, contentType: 'image/png', body: TILE })
    })

    const folha = page.locator('dialog.mapa-folha')
    const tela = folha.locator('[data-teste="mapa-roteiro"]')
    const marca = (m) => folha.locator(`.mk[data-marcador="${m}"]`)
    // O marcador da posição também é um "botão" de nome parecido: o botão é o da tela, não o do mapa.
    const minhaPosicao = folha.locator('button.botao', { hasText: 'Minha posição' })
    /** A posição do ponto na tela, depois que o enquadramento (animado) termina. */
    const posicaoEstavel = async () => {
      let anterior = ''
      return aguardar(
        async () => {
          const atual = JSON.stringify(await marca('posicao').boundingBox())
          const parou = atual === anterior
          anterior = atual
          return parou ? atual : null
        },
        (v) => v !== null,
        'o mapa deveria parar de se mover',
      )
    }
    const abrirMapa = async () => {
      await irParaAba(page, 'roteiro')
      await page.getByRole('tab', { name: 'Paradas' }).click()
      await botao(page, 'Mapa', { exact: true }).click()
      await folha.waitFor()
      await tela.locator('.leaflet-tile-loaded').first().waitFor()
    }
    const fecharMapa = async () => {
      await botao(page, 'Fechar o mapa').click()
      await folha.waitFor({ state: 'detached' })
    }

    await abrirDemo(page)
    await escolherCenario(page, 'Saída atrasada', 2)

    await passo('cadastra as coordenadas (fictícias) de seis dos oito locais pelo formulário', async () => {
      for (const [nome, texto] of Object.entries(COORDENADAS)) {
        await irParaAba(page, 'locais')
        await botao(page, `Editar ${nome}`).click()
        await page.locator('#l-nome').waitFor()
        await page.locator('#l-coord').fill(texto)
        await botao(page, 'Salvar local').click()
        await page.locator('.barra-abas').waitFor()
      }
      const comCoordenadas = (await lerBanco(page, 'locais')).filter((l) => l.coordenadas).length
      igual(String(comCoordenadas), '6', 'locais com coordenadas')
    })

    await passo('o botão Mapa está ligado e abre o mapa em tela cheia, com tiles e atribuição do OpenStreetMap', async () => {
      await irParaAba(page, 'roteiro')
      esperar(await botao(page, 'Mapa', { exact: true }).isEnabled(), 'Mapa deveria estar ligado')
      esperar(!(await page.getByText('chega na fase 9').count()), 'o aviso "chega na fase 9" deveria ter saído')
      await abrirMapa()
      esperar(tiles.length > 0 && tiles.every((u) => /^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/.test(u)), `tiles: ${tiles.slice(0, 3)}`)
      esperar((await tela.locator('.leaflet-control-attribution').innerText()).includes('OpenStreetMap'), 'atribuição visível')
      const caixa = await tela.boundingBox()
      esperar(caixa.width >= 350 && caixa.height >= 280, `tamanho do mapa: ${JSON.stringify(caixa)}`)
    })

    await passo('marcadores por situação: feita, próxima, adiante (sem o jantar) e a alternativa; linhas retas', async () => {
      igual(String(await marca('feita').count()), '1', 'feitas (a origem)')
      igual(String(await marca('proxima').count()), '1', 'próxima (o ponto de embarque)')
      igual(String(await marca('futura').count()), '3', 'adiante: almoço, café e destino (o jantar não tem coordenadas)')
      igual(String(await marca('alternativa').count()), '1', 'alternativas com coordenadas (a B; a C não tem; a A é o local do almoço)')
      igual(String(await folha.locator('.linha-mapa.adiante').count()), '3', 'linhas entre paradas vizinhas com coordenadas (origem–embarque, embarque–almoço, almoço–café)')
      igual(String(await folha.locator('.linha-mapa.alternativa').count()), '1', 'linha da alternativa até a parada anterior')
      igual(String(await tela.locator('.mk-incluida').count()), '0', 'nenhuma parada incluída em viagem')
    })

    await passo('a tela diz quantos locais ficaram de fora, com os nomes', async () => {
      const texto = (await folha.locator('[data-teste="mapa-fora"]').innerText()).replace(/\s+/g, ' ')
      esperar(texto.startsWith('2 locais sem coordenadas não aparecem no mapa:') && texto.includes('Restaurante C') && texto.includes('Restaurante do jantar'), `texto: ${texto}`)
    })

    await passo('tocar num marcador mostra o nome e a situação', async () => {
      await marca('proxima').click()
      const balao = await folha.locator('.leaflet-popup-content').innerText()
      esperar(balao.includes('Ponto de embarque') && balao.includes('Próxima'), `balão: ${balao}`)
    })

    await passo('"Minha posição": uma leitura, ponto com a precisão, hora e nada gravado', async () => {
      const eventosAntes = (await lerBanco(page, 'eventos')).length
      igual(String(await marca('posicao').count()), '0', 'sem posição antes de tocar')
      await minhaPosicao.click()
      await marca('posicao').waitFor()
      const texto = await folha.locator('[data-teste="mapa-posicao"]').innerText()
      esperar(/^Posição às \d{2}:\d{2}, precisão de cerca de 25 m\./.test(texto) && texto.includes('não acompanha o ônibus'), `texto: ${texto}`)
      igual(String(await folha.locator('.precisao-mapa').count()), '1', 'círculo da precisão')
      igual(String((await lerBanco(page, 'eventos')).length), String(eventosAntes), 'a leitura do GPS não grava evento')
    })

    await passo('sem rastreamento: o ponto só muda quando se toca de novo em "Minha posição"', async () => {
      const antes = await posicaoEstavel()
      await ctx.setGeolocation({ latitude: -19.18, longitude: -42.18, accuracy: 25 })
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
      igual(await posicaoEstavel(), antes, 'o ponto não se mexe sozinho')
      await minhaPosicao.click()
      await aguardar(() => marca('posicao').boundingBox().then((b) => JSON.stringify(b)), (v) => v !== antes, 'o ponto deveria ir para a posição nova')
    })

    await passo('permissão negada: mensagem clara e o mapa continua', async () => {
      await ctx.clearPermissions()
      await minhaPosicao.click()
      const erro = await folha.locator('[data-teste="mapa-erro-gps"]').innerText()
      esperar(/Sem permissão/.test(erro), `mensagem: ${erro}`)
      igual(String(await marca('proxima').count()), '1', 'marcadores continuam')
      await ctx.grantPermissions(['geolocation'], { origin: origem })
    })

    await passo('fechar volta à aba Roteiro; o botão voltar do celular também fecha só o mapa', async () => {
      await fecharMapa()
      igual(await page.locator('.aba[aria-current="page"]').innerText(), 'Roteiro', 'continua na aba Roteiro')
      await botao(page, 'Mapa', { exact: true }).click()
      await folha.waitFor()
      await page.goBack()
      await folha.waitFor({ state: 'detached' })
      igual(await page.locator('.aba[aria-current="page"]').innerText(), 'Roteiro', 'o voltar fechou só o mapa')
    })

    await passo('sem internet: o mapa avisa e os marcadores continuam; nada mais do app depende dele', async () => {
      await ctx.setOffline(true)
      await botao(page, 'Mapa', { exact: true }).click()
      await folha.waitFor()
      await folha.locator('[data-teste="mapa-sem-internet"]').waitFor()
      esperar((await folha.locator('[data-teste="mapa-sem-internet"]').innerText()).startsWith('Sem internet ou sinal fraco: o mapa não carrega'), 'aviso do mapa')
      igual(String(await marca('proxima').count()), '1', 'marcadores aparecem sem tiles')
      await fecharMapa()
      await page.getByRole('tab', { name: 'Timeline' }).click()
      await page.getByText('Viagem iniciada').first().waitFor()
      await ctx.setOffline(false)
    })

    await passo('com a viagem em andamento o desenho segue o estado: depois de CHEGAMOS, o embarque vira "estamos aqui" e o almoço passa a próxima', async () => {
      await irParaAba(page, 'viagem')
      await botao(page, 'CHEGAMOS').first().click()
      await botao(page, 'Agora não').click()
      await page.getByText('PARADOS EM PONTO DE EMBARQUE').waitFor()
      await abrirMapa()
      igual(`${await marca('feita').count()}/${await marca('aqui').count()}/${await marca('proxima').count()}`, '1/1/1', 'feita, estamos aqui e próxima (o almoço)')
      igual(String(await folha.locator('.linha-mapa.percorrida').count()), '1', 'a linha percorrida liga a origem ao ponto de embarque')
      await fecharMapa()
    })
  },
}
