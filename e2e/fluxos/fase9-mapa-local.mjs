// Fase 9, parte 1: marcar o local no mapa (cadastro de local). Os tiles do OpenStreetMap, a busca
// (Photon) e o GPS são simulados: nenhuma chamada sai para a internet.

const CORS = { 'access-control-allow-origin': '*' }
// PNG de 1 pixel, só para o Leaflet ter o que desenhar.
const TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
const POSICAO = { latitude: -19.4687, longitude: -42.5367 }

export const fluxo = {
  nome: 'Fase 9: mapa e pino no cadastro de local (tiles, busca e GPS simulados)',
  async executar(h) {
    const { esperar, igual, aguardar, passo, botao, irParaAba, abrirDemo, lerBanco } = h
    const { ctx, page } = await h.novaPagina()
    const origem = h.base.replace(/\/$/, '')
    await ctx.grantPermissions(['geolocation'], { origin: origem })
    await ctx.setGeolocation({ ...POSICAO, accuracy: 20 })

    const pedidos = { tiles: [] }
    await ctx.route('https://tile.openstreetmap.org/**', (rota) => {
      pedidos.tiles.push(rota.request().url())
      return rota.fulfill({ status: 200, headers: CORS, contentType: 'image/png', body: TILE })
    })
    await ctx.route('https://photon.komoot.io/**', (rota) => {
      const feature = (nome, lat, lng, extra = {}) => ({ type: 'Feature', properties: { name: nome, city: 'Ipatinga', state: 'Minas Gerais', countrycode: 'BR', ...extra }, geometry: { type: 'Point', coordinates: [lng, lat] } })
      const features = [feature('Restaurante fictício', -19.47, -42.54, { osm_key: 'amenity', osm_value: 'restaurant', type: 'house' }), feature('Rua fictícia', -19.5, -42.55, { type: 'street', osm_key: 'highway' })]
      return rota.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ type: 'FeatureCollection', features }) })
    })

    const mapa = page.locator('[data-teste="mapa-local"]')
    const tela = mapa.locator('.mapa-tela')
    const pino = mapa.locator('.pino-mapa')
    const coord = page.locator('#l-coord')
    const link = page.locator('[data-teste="conferir-maps"]')
    const numeros = async () => (await coord.inputValue()).split(',').map(Number)
    const novoLocal = async () => {
      await irParaAba(page, 'locais')
      await botao(page, 'Novo local').click()
      await mapa.waitFor()
      await tela.locator('.leaflet-tile-loaded').first().waitFor()
    }
    /** Mouse só alcança o que está na janela: leva o mapa para o meio da tela antes de medir. */
    const centralizarMapa = () => tela.evaluate((e) => e.scrollIntoView({ block: 'center' }))
    /** O centro da base do pino (a ponta) em coordenadas da página. */
    const ponta = async () => {
      const c = await pino.boundingBox()
      return { x: c.x + 22, y: c.y + 42 }
    }
    const destinoDoLink = async () => decodeURIComponent((await link.getAttribute('href')).split('destination=')[1])

    await abrirDemo(page)

    await passo('abre o mapa só no formulário: tiles do OpenStreetMap, atribuição visível, sem pino nem link sem coordenadas', async () => {
      igual(String(await page.locator('.leaflet-container').count()), '0', 'nenhum mapa fora do formulário')
      await novoLocal()
      esperar(pedidos.tiles.length > 0 && pedidos.tiles.every((u) => /^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/.test(u)), `tiles: ${pedidos.tiles.slice(0, 3)}`)
      esperar((await tela.locator('.leaflet-control-attribution').innerText()).includes('OpenStreetMap'), 'atribuição visível')
      igual(String(await pino.count()), '0', 'sem pino sem coordenadas')
      igual(String(await link.count()), '0', 'sem link sem coordenadas')
      esperar((await page.locator('main').innerText()).includes('Vale o ponto do pino'), 'texto do pino')
    })

    await passo('buscar e escolher um resultado centraliza o mapa e põe o pino; o link aponta para ele', async () => {
      await page.locator('#l-busca').fill('restaurante ficticio')
      await botao(page, 'Buscar', { exact: true }).click()
      await page.getByRole('list', { name: 'Resultados da busca' }).getByRole('button').first().click()
      await pino.waitFor()
      igual(await mapa.getAttribute('data-pino'), '-19.47,-42.54', 'ponto do pino')
      igual(await destinoDoLink(), '-19.47,-42.54', 'link do Google Maps')
      const m = await tela.boundingBox()
      const p = await ponta()
      esperar(Math.abs(p.x - (m.x + m.width / 2)) < 3 && Math.abs(p.y - (m.y + m.height / 2)) < 3, `pino no centro do mapa: ${JSON.stringify({ p, m })}`)
    })

    await passo('resultado aproximado sugere ajustar o pino no mapa', async () => {
      await page.locator('#l-busca').fill('rua ficticia')
      await botao(page, 'Buscar', { exact: true }).click()
      await page.getByRole('list', { name: 'Resultados da busca' }).getByRole('button').nth(1).click()
      const dica = await page.locator('[data-teste="dica-aproximado"]').innerText()
      esperar(dica.includes('ajuste o pino no mapa'), `dica: ${dica}`)
      igual(await mapa.getAttribute('data-pino'), '-19.5,-42.55', 'o pino foi para o resultado')
    })

    await passo('tocar no mapa move o pino e preenche as coordenadas na hora; o link muda', async () => {
      const antes = await numeros()
      await centralizarMapa()
      const m = await tela.boundingBox()
      const alvo = { x: m.x + m.width / 2 + 70, y: m.y + m.height / 2 + 50 }
      await page.mouse.click(alvo.x, alvo.y)
      const depois = await aguardar(numeros, (v) => v[0] !== antes[0] || v[1] !== antes[1], 'as coordenadas deveriam mudar com o toque')
      esperar(depois[0] < antes[0] && depois[1] > antes[1], `tocou ao sul e a leste: ${antes} → ${depois}`)
      const p = await ponta()
      esperar(Math.abs(p.x - alvo.x) < 3 && Math.abs(p.y - alvo.y) < 3, `a ponta do pino fica onde se tocou: ${JSON.stringify({ p, alvo })}`)
      igual(await destinoDoLink(), `${depois[0]},${depois[1]}`, 'o link segue o pino')
    })

    await passo('arrastar o pino muda as coordenadas e o link', async () => {
      const antes = await numeros()
      const linkAntes = await link.getAttribute('href')
      await centralizarMapa()
      const p = await pino.boundingBox()
      const de = { x: p.x + 22, y: p.y + 20 }
      await page.mouse.move(de.x, de.y)
      await page.mouse.down()
      await page.mouse.move(de.x - 40, de.y - 30, { steps: 8 })
      await page.mouse.up()
      const depois = await aguardar(numeros, (v) => v[0] !== antes[0] && v[1] !== antes[1], 'as coordenadas deveriam mudar com o arrasto')
      esperar(depois[0] > antes[0] && depois[1] < antes[1], `arrastou ao norte e a oeste: ${antes} → ${depois}`)
      esperar((await link.getAttribute('href')) !== linkAntes, 'o link deveria mudar')
      igual(await destinoDoLink(), `${depois[0]},${depois[1]}`, 'o link segue o pino')
    })

    await passo('colar coordenadas move o pino; coordenadas inválidas não o tiram do lugar e escondem o link', async () => {
      await coord.fill('-19.5, -42.5')
      await aguardar(() => mapa.getAttribute('data-pino'), '-19.5,-42.5', 'o pino deveria ir para as coordenadas coladas')
      igual(await destinoDoLink(), '-19.5,-42.5', 'link')
      const m = await tela.boundingBox()
      const p = await ponta()
      esperar(Math.abs(p.x - (m.x + m.width / 2)) < 3 && Math.abs(p.y - (m.y + m.height / 2)) < 3, 'o mapa centraliza no ponto colado')
      await coord.fill('lixo')
      await aguardar(() => link.count(), 0, 'sem coordenadas válidas não há link')
      await coord.fill('https://www.google.com/maps/@-19.6,-42.6,17z')
      await aguardar(() => mapa.getAttribute('data-pino'), '-19.6,-42.6', 'link do Google Maps colado também move o pino')
    })

    await passo('"Usar minha localização": põe o pino no GPS; só vira dado do local ao salvar', async () => {
      await botao(page, 'Usar minha localização').click()
      await aguardar(() => mapa.getAttribute('data-pino'), `${POSICAO.latitude},${POSICAO.longitude}`, 'o pino deveria ir para o GPS')
      igual((await coord.inputValue()), `${POSICAO.latitude}, ${POSICAO.longitude}`, 'coordenadas')
      esperar((await page.locator('[data-teste="aviso-gps"]').innerText()).includes('Pino colocado'), 'mensagem de sucesso')
      esperar((await page.locator('main').innerText()).includes('só vira as coordenadas do local quando você toca em Salvar local'), 'texto de privacidade')
      await botao(page, 'Cancelar').click()
      await page.locator('.barra-abas').waitFor()
      esperar(!(await lerBanco(page, 'locais')).some((l) => l.coordenadas?.lat === POSICAO.latitude), 'cancelar não grava a posição')
    })

    await passo('GPS impreciso (acima de 50 m) avisa sem bloquear; permissão negada e sem sinal têm mensagem própria', async () => {
      await novoLocal()
      await ctx.setGeolocation({ ...POSICAO, accuracy: 120 })
      await botao(page, 'Usar minha localização').click()
      const aviso = await aguardar(() => page.locator('[data-teste="aviso-gps"]').innerText().catch(() => ''), (t) => t.includes('120 m'), 'aviso de precisão')
      esperar(aviso.includes('Arraste o pino'), aviso)
      igual(await mapa.getAttribute('data-pino'), `${POSICAO.latitude},${POSICAO.longitude}`, 'o pino fica, apesar do aviso')
      await coord.fill('')
      await ctx.clearPermissions()
      await botao(page, 'Usar minha localização').click()
      await aguardar(() => page.locator('[data-teste="aviso-gps"]').innerText().catch(() => ''), (t) => t.includes('Sem permissão'), 'mensagem de permissão negada')
      igual(await coord.inputValue(), '', 'nada preenchido sem permissão')
      await ctx.grantPermissions(['geolocation'], { origin: origem })
      await ctx.setGeolocation({ ...POSICAO, accuracy: 20 })
    })

    await passo('sem internet: o mapa avisa, a busca avisa e o formulário continua funcionando e salva', async () => {
      await ctx.setOffline(true)
      await page.locator('[data-teste="mapa-sem-internet"]').waitFor()
      esperar((await page.locator('[data-teste="mapa-sem-internet"]').innerText()).startsWith('Sem internet ou sinal fraco: o mapa não carrega'), 'aviso do mapa')
      await page.locator('#l-busca').fill('qualquer lugar')
      await botao(page, 'Buscar', { exact: true }).click()
      await page.getByText('Sem internet ou sinal fraco: a busca de endereço precisa de conexão.').first().waitFor()
      await page.locator('#l-nome').fill('Posto fictício do mapa')
      await page.locator('#l-cidade').fill('Cidade X')
      await coord.fill('-19.7, -42.7')
      await aguardar(() => mapa.getAttribute('data-pino'), '-19.7,-42.7', 'o pino segue as coordenadas sem tiles')
      await botao(page, 'Salvar local').click()
      await page.locator('.barra-abas').waitFor()
      const local = (await lerBanco(page, 'locais')).find((l) => l.nome === 'Posto fictício do mapa')
      igual(JSON.stringify(local?.coordenadas), JSON.stringify({ lat: -19.7, lng: -42.7 }), 'local gravado com as coordenadas do pino')
      await ctx.setOffline(false)
    })

    await passo('editar local: abre no ponto das coordenadas já preenchidas', async () => {
      await irParaAba(page, 'locais')
      await botao(page, 'Editar Posto fictício do mapa').click()
      await mapa.waitFor()
      await pino.waitFor()
      igual(await mapa.getAttribute('data-pino'), '-19.7,-42.7', 'pino do local salvo')
    })

    await passo('os tiles nunca entram no cache do service worker', async () => {
      const urls = await page.evaluate(async () => {
        const todas = []
        for (const nome of await caches.keys()) for (const r of await (await caches.open(nome)).keys()) todas.push(r.url)
        return todas
      })
      esperar(!urls.some((u) => u.includes('tile.openstreetmap.org')), 'há tile no cache do service worker')
    })
  },
}
