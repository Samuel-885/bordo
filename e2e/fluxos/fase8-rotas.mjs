// Fase 8: busca de endereço no cadastro de local e "Calcular tempos" no planejamento, com os
// serviços (Photon e OSRM) simulados por `route`: nenhuma chamada sai para a internet.

const LOCAIS = [
  ['Ponto de saída', -19.0, -42.0],
  ['Ponto de embarque', -19.1, -42.1],
  ['Restaurante A', -19.2, -42.2],
  ['Restaurante B', -19.3, -42.3],
  ['Restaurante C', -19.4, -42.4],
  ['Lanchonete do café', -19.5, -42.5],
  ['Restaurante do jantar', -19.6, -42.6],
  ['Ponto de chegada', -19.7, -42.7],
]

/** Minutos de carro por par (latitude de saída > latitude de chegada). O que não está aqui, 90. */
const CARRO = {
  '-19>-19.1': 100, // roteiro 1h55 → fator implícito 1,15
  '-19.1>-19.2': 160, // roteiro 3h20 → 1,25
  '-19.1>-19.3': 120, // manual 3h40 (220): diferença grande
  '-19.1>-19.4': 200, // manual 4h10 (250): diferença pequena
  '-19.2>-19.5': 150, // roteiro 3h00 → 1,20
  '-19.3>-19.5': 100, // manual 3h00 (180): diferença grande
  '-19.4>-19.5': 150,
  '-19.5>-19.6': 200, // roteiro 4h00 → 1,20
  '-19.6>-19.7': 110, // roteiro 2h10 → 1,18
}

const CORS = { 'access-control-allow-origin': '*' }

export const fluxo = {
  nome: 'Fase 8: busca de endereço e cálculo de tempos pela rota (serviços simulados)',
  async executar(h) {
    const { esperar, igual, passo, botao, irParaAba, dialogoAberto, abrirDemo, lerBanco } = h
    const { ctx, page } = await h.novaPagina()

    // ---------- Serviços simulados ----------
    const pedidos = { busca: [], rotas: [] }
    const modo = { busca: 'ok', rotas: 'ok' }
    await ctx.route('https://photon.komoot.io/**', (rota) => {
      pedidos.busca.push(rota.request().url())
      if (modo.busca === 'limite') return rota.fulfill({ status: 429, headers: CORS, body: 'Too Many Requests' })
      if (modo.busca === 'vazio') return rota.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ type: 'FeatureCollection', features: [] }) })
      const feature = (nome, lat, lng, cidade) => ({ type: 'Feature', properties: { name: nome, city: cidade, state: 'Minas Gerais', countrycode: 'BR' }, geometry: { type: 'Point', coordinates: [lng, lat] } })
      const features = [feature('Ponto de saída', -19.0, -42.0, 'Ipatinga'), ...Array.from({ length: 6 }, (_, i) => feature(`Outro lugar ${i + 1}`, -20 - i, -43, 'Outra cidade'))]
      return rota.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ type: 'FeatureCollection', features }) })
    })
    await ctx.route('https://routing.openstreetmap.de/**', (rota) => {
      const url = rota.request().url()
      pedidos.rotas.push(url)
      if (modo.rotas === 'limite') return rota.fulfill({ status: 429, headers: CORS, body: 'Too Many Requests' })
      const m = /driving\/(-?[\d.]+),(-?[\d.]+);(-?[\d.]+),(-?[\d.]+)/.exec(url)
      const chave = `${m[2]}>${m[4]}`
      if (modo.rotas === 'sem-rota-cafe-jantar' && chave === '-19.5>-19.6') {
        return rota.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ code: 'Ok', routes: [] }) })
      }
      const min = CARRO[chave] ?? 90
      return rota.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ code: 'Ok', routes: [{ duration: min * 60, distance: min * 900 }] }) })
    })

    const trechos = () => lerBanco(page, 'trechos')
    const achar = async (de, ate) => (await trechos()).find((t) => t.localOrigemId.endsWith(de) && t.localDestinoId.endsWith(ate))
    const editarLocal = async (nome) => {
      await irParaAba(page, 'locais')
      await botao(page, `Editar ${nome}`).click()
      await page.locator('#l-nome').waitFor()
    }
    const salvarLocal = async () => {
      await botao(page, 'Salvar local').click()
      await page.locator('.barra-abas').waitFor()
    }
    const cartaoRotas = page.locator('.calculo-rotas')
    const calcular = async (esperado) => {
      await irParaAba(page, 'roteiro')
      await cartaoRotas.getByRole('button', { name: 'Calcular tempos' }).click()
      await cartaoRotas.getByText(esperado).waitFor({ timeout: 40000 })
    }
    /** O bloco "Tempos das alternativas" só abre sozinho com tempo faltando ou escolha pendente. */
    const abrirTempos = () => page.locator('.tempos-alternativas').evaluateAll((els) => els.forEach((e) => (e.open = true)))
    const linha = (rotulo) => page.locator('.tempos-alternativas .trecho', { hasText: rotulo })

    await abrirDemo(page)

    await passo('busca de endereço: mostra no máximo 5 resultados e a escolha preenche coordenadas e cidade (editáveis)', async () => {
      await editarLocal('Ponto de saída')
      await page.locator('#l-cidade').fill('Cidade errada')
      await page.locator('#l-busca').fill('ponto de saida ipatinga')
      await botao(page, 'Buscar', { exact: true }).click()
      const lista = page.getByRole('list', { name: 'Resultados da busca' })
      await lista.waitFor()
      igual(String(await lista.getByRole('button').count()), '5', 'resultados (o serviço devolveu 7)')
      await lista.getByRole('button').first().click()
      igual(await page.locator('#l-coord').inputValue(), '-19, -42', 'coordenadas preenchidas')
      igual(await page.locator('#l-cidade').inputValue(), 'Ipatinga', 'cidade preenchida')
      await page.locator('#l-cidade').fill('Ipatinga (editada)')
      await page.locator('#l-cidade').fill('Ipatinga')
      await salvarLocal()
      const local = (await lerBanco(page, 'locais')).find((l) => l.nome === 'Ponto de saída')
      igual(JSON.stringify(local.coordenadas), JSON.stringify({ lat: -19, lng: -42 }), 'coordenadas gravadas')
    })

    await passo('a busca leva só o texto digitado e as rotas só as coordenadas (nada de nomes de passageiros)', async () => {
      igual(pedidos.busca.join('|'), 'https://photon.komoot.io/api/?q=ponto%20de%20saida%20ipatinga&limit=5', 'URL da busca')
    })

    await passo('busca: serviço no limite, sem resultado e sem internet avisam, e o resto do formulário funciona', async () => {
      await botao(page, 'Novo local').click().catch(async () => {
        await irParaAba(page, 'locais')
        await botao(page, 'Novo local').click()
      })
      await page.locator('#l-nome').waitFor()
      modo.busca = 'limite'
      await page.locator('#l-busca').fill('posto qualquer')
      await botao(page, 'Buscar', { exact: true }).click()
      await page.getByText('pedidos demais').waitFor()
      modo.busca = 'vazio'
      await botao(page, 'Buscar', { exact: true }).click()
      await page.getByText('Nada encontrado para "posto qualquer"').waitFor()
      modo.busca = 'ok'
      const antes = pedidos.busca.length
      await ctx.setOffline(true)
      await botao(page, 'Buscar', { exact: true }).click()
      await page.getByText('Sem internet: a busca de endereço precisa de conexão.').first().waitFor()
      igual(String(pedidos.busca.length), String(antes), 'sem internet não faz requisição')
      await page.locator('#l-nome').fill('Posto sem busca')
      await page.locator('#l-cidade').fill('Cidade X')
      await page.locator('#l-coord').fill('-19.5, -42.5')
      await ctx.setOffline(false)
      await botao(page, 'Cancelar').click()
      await page.locator('.barra-abas').waitFor()
      esperar(!(await lerBanco(page, 'locais')).some((l) => l.nome === 'Posto sem busca'), 'cancelar não grava o local')
    })

    await passo('o campo de coordenadas coladas continua funcionando (todos os locais, menos a lanchonete do café)', async () => {
      for (const [nome, lat, lng] of LOCAIS.slice(1)) {
        if (nome === 'Lanchonete do café') continue
        await editarLocal(nome)
        await page.locator('#l-coord').fill(`${lat}, ${lng}`)
        await salvarLocal()
      }
      const comCoordenadas = (await lerBanco(page, 'locais')).filter((l) => l.coordenadas).length
      igual(String(comCoordenadas), '7', 'locais com coordenadas')
    })

    await passo('trecho sem coordenadas fica como está, com a dica de cadastrar', async () => {
      await irParaAba(page, 'roteiro')
      await abrirTempos()
      const card = (await cartaoRotas.innerText()).replace(/\s+/g, ' ')
      esperar(card.includes('5 trechos com coordenadas'), `trechos com coordenadas: ${card}`)
      esperar(card.includes('Sem coordenadas, sem rota') && card.includes('Lanchonete do café'), `dica de coordenadas ausente: ${card}`)
      esperar((await linha('Restaurante B → Lanchonete do café').innerText()).includes('Sem coordenadas em Lanchonete do café: cadastre em Locais'), 'dica no trecho do café')
    })

    await passo('Calcular tempos (1ª vez): grava rota, distância e data; roteiro e manual intactos; fator implícito aparece', async () => {
      const manualAntes = JSON.stringify((await trechos()).filter((t) => t.fonte === 'manual').map((t) => [t.localOrigemId, t.localDestinoId, t.duracaoMin]).sort())
      await calcular('5 trechos calculados.')
      igual(String(pedidos.rotas.length), '5', 'requisições ao serviço de rotas')
      for (const url of pedidos.rotas) {
        esperar(/^https:\/\/routing\.openstreetmap\.de\/routed-car\/route\/v1\/driving\/-?[\d.]+,-?[\d.]+;-?[\d.]+,-?[\d.]+\?overview=false$/.test(url), `URL de rota inesperada: ${url}`)
      }
      const saidaMonlevade = await achar('l-saida', 'l-monlevade')
      igual(saidaMonlevade.fonte, 'rota', 'fonte')
      igual(String(saidaMonlevade.duracaoMin), '100', 'minutos de carro')
      igual(String(saidaMonlevade.distanciaKm), '90', 'distância (km)')
      esperar(/^\d{4}-\d{2}-\d{2}T[\d:]+-03:00$/.test(saidaMonlevade.calculadoEm), `calculadoEm: ${saidaMonlevade.calculadoEm}`)
      const manualDepois = JSON.stringify((await trechos()).filter((t) => t.fonte === 'manual').map((t) => [t.localOrigemId, t.localDestinoId, t.duracaoMin]).sort())
      igual(manualDepois, manualAntes, 'tempos manuais (valores)')
      const primeiro = (await page.locator('section[aria-label="Etapas"] > .trecho').first().innerText()).replace(/\s+/g, ' ')
      esperar(primeiro.includes('1h55') && primeiro.includes('do roteiro') && primeiro.includes('roteiro 1h55 · carro 1h40 · fator implícito 1,15'), `trecho com roteiro: ${primeiro}`)
      esperar(primeiro.includes('90 km · calculado em'), `distância e data: ${primeiro}`)
    })

    await passo('cadastrar as coordenadas que faltavam e recalcular: os 9 trechos têm rota; o manual divergente mostra os dois tempos', async () => {
      await cartaoRotas.getByRole('button', { name: 'Lanchonete do café' }).click()
      await page.locator('#l-coord').fill('-19.5, -42.5')
      await salvarLocal()
      await irParaAba(page, 'roteiro')
      pedidos.rotas.length = 0
      await calcular('9 trechos calculados.')
      igual(String(pedidos.rotas.length), '9', 'requisições (recalcular refaz também os trechos de rota)')
      const resumos = await page.locator('.tempos-alternativas > summary').allInnerTexts()
      esperar(resumos.length === 2 && resumos.every((r) => r.includes('1 para escolher')), `o bloco abre sozinho com a escolha pendente: ${resumos}`)
      esperar(await page.locator('.tempos-alternativas').first().evaluate((e) => e.open), 'bloco aberto')
      const comRota = (await trechos()).filter((t) => t.fonte === 'rota' || t.rota)
      igual(String(comRota.length), '9', 'trechos com rota guardada')
      const b = await achar('l-monlevade', 'l-rest-b')
      igual(`${b.fonte}:${b.duracaoMin}:${b.rota?.duracaoMin}`, 'manual:220:120', 'manual preservado, rota ao lado')
      const texto = (await linha('Ponto de embarque → Restaurante B').innerText()).replace(/\s+/g, ' ')
      esperar(texto.includes('Seu tempo 3h40 · rota 2h18 (diferença +1h22)'), `comparação: ${texto}`)
      esperar(texto.includes('Usar a rota') && texto.includes('Manter o meu'), 'faltam os botões da escolha')
      const c = (await linha('Ponto de embarque → Restaurante C').innerText()).replace(/\s+/g, ' ')
      esperar(c.includes('manual') && !c.includes('Usar a rota'), `diferença pequena não pede escolha: ${c}`)
      esperar(c.includes('rota: 3h50 (carro 3h20 × fator 1,15)'), `rota ao lado do manual: ${c}`)
    })

    await passo('"Usar a rota" troca o manual pela rota (e descarta o tempo digitado)', async () => {
      await linha('Ponto de embarque → Restaurante B').getByRole('button', { name: 'Usar a rota' }).click()
      await page.waitForFunction(() => document.body.innerText.includes('calculado pela rota'))
      const b = await achar('l-monlevade', 'l-rest-b')
      igual(`${b.fonte}:${b.duracaoMin}:${b.rota ?? 'sem'}`, 'rota:120:sem', 'trecho depois de usar a rota')
      const texto = (await linha('Ponto de embarque → Restaurante B').innerText()).replace(/\s+/g, ' ')
      esperar(texto.includes('2h18') && texto.includes('carro 2h00 × fator 1,15'), `rota com fator: ${texto}`)
    })

    await passo('"Manter o meu" guarda o manual e descarta a rota ao lado', async () => {
      await linha('Restaurante B → Lanchonete do café').getByRole('button', { name: 'Manter o meu' }).click()
      await page.waitForFunction(() => !document.body.innerText.includes('Manter o meu'))
      const t = await achar('l-rest-b', 'l-cafe')
      igual(`${t.fonte}:${t.duracaoMin}:${t.rota ?? 'sem'}`, 'manual:180:sem', 'trecho depois de manter o meu')
    })

    await passo('fator ônibus: sugestão pela média dos fatores implícitos, aplicada só ao tocar; só de 1,00 a 2,00', async () => {
      await irParaAba(page, 'viagem')
      const campo = page.locator('#v-fator')
      igual(await campo.inputValue(), '1,15', 'fator padrão')
      const sugestao = (await page.locator('.fator-sugestao').innerText()).replace(/\s+/g, ' ')
      esperar(sugestao.includes('Sugestão pelo roteiro: 1,20') && sugestao.includes('média de 5 trechos'), `sugestão: ${sugestao}`)
      igual(String((await lerBanco(page, 'viagens'))[0].fatorOnibus), '1.15', 'a sugestão não é aplicada sozinha')
      await campo.fill('2,5')
      await campo.blur()
      await page.getByText('O fator ônibus precisa ficar entre 1,00 e 2,00.').waitFor()
      igual(String((await lerBanco(page, 'viagens'))[0].fatorOnibus), '1.15', 'valor recusado não é gravado')
      await campo.fill('1,15')
      await campo.blur()
      await page.locator('.fator-sugestao').getByRole('button', { name: 'Usar 1,20' }).click()
      await page.waitForFunction(() => !document.querySelector('.fator-sugestao button'))
      igual(String((await lerBanco(page, 'viagens'))[0].fatorOnibus), '1.2', 'fator gravado')
      igual(await campo.inputValue(), '1,20', 'campo atualizado')
    })

    await passo('o fator novo vale no cálculo: rota de 2h00 de carro × 1,20 = 2h24', async () => {
      await irParaAba(page, 'roteiro')
      await abrirTempos()
      const texto = (await linha('Ponto de embarque → Restaurante B').innerText()).replace(/\s+/g, ' ')
      esperar(texto.includes('2h24') && texto.includes('carro 2h00 × fator 1,20'), `rota com o fator novo: ${texto}`)
    })

    await passo('serviço de rotas no limite: para na primeira resposta, avisa e não perde o que já está guardado', async () => {
      const antes = JSON.stringify(await trechos())
      modo.rotas = 'limite'
      pedidos.rotas.length = 0
      await calcular('atingiu o limite de uso')
      igual(String(pedidos.rotas.length), '1', 'requisições antes de parar (sem insistir)')
      const texto = (await cartaoRotas.innerText()).replace(/\s+/g, ' ')
      esperar(texto.includes('9 trechos ficaram sem calcular'), `restantes: ${texto}`)
      igual(JSON.stringify(await trechos()), antes, 'nada guardado foi alterado')
    })

    await passo('par sem rota (resposta vazia) é avisado e o resto continua', async () => {
      modo.rotas = 'sem-rota-cafe-jantar'
      pedidos.rotas.length = 0
      await calcular('8 trechos calculados.')
      const texto = (await cartaoRotas.innerText()).replace(/\s+/g, ' ')
      esperar(texto.includes('Sem rota encontrada: Lanchonete do café → Restaurante do jantar'), `aviso: ${texto}`)
      igual(String(pedidos.rotas.length), '9', 'todos os pares foram tentados')
      modo.rotas = 'ok'
    })

    await passo('sem internet: avisa antes de tentar e os tempos guardados continuam valendo', async () => {
      const antes = JSON.stringify(await trechos())
      pedidos.rotas.length = 0
      await ctx.setOffline(true)
      await irParaAba(page, 'roteiro')
      await cartaoRotas.getByRole('button', { name: 'Calcular tempos' }).click()
      await cartaoRotas.getByText('Sem internet: o cálculo de rotas precisa de conexão.').first().waitFor()
      igual(String(pedidos.rotas.length), '0', 'requisições sem internet')
      igual(JSON.stringify(await trechos()), antes, 'trechos intactos')
      await ctx.setOffline(false)
    })

    await passo('iniciar a viagem: o plano original continua o do roteiro (23:30 no destino) e a rota não o altera', async () => {
      await irParaAba(page, 'viagem')
      await botao(page, 'INICIAR VIAGEM').click()
      await dialogoAberto(page).getByRole('button', { name: 'INICIAR SEM BACKUP' }).click()
      await page.locator('.rodape-fixo').waitFor()
      const viagem = (await lerBanco(page, 'viagens'))[0]
      igual(viagem.status, 'em_andamento', 'status')
      const etapas = viagem.planoOriginal.etapas
      igual(etapas.at(-1).chegada.slice(11, 16), '23:30', 'chegada original no destino')
      igual(etapas[1].chegada.slice(11, 16), '08:25', 'chegada original em Monlevade')
      igual(String(viagem.fatorOnibus), '1.2', 'fator guardado')
    })

    await ctx.close()
  },
}
