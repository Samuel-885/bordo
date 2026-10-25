// Atualizar pela minha localização: GPS do navegador e OSRM simulados (nenhuma chamada sai para a
// internet). Cobre prévia, fator ônibus, precisão ruim, confirmar, timeline, DESFAZER, permissão
// negada, sem internet e serviço fora.

const CORS = { 'access-control-allow-origin': '*' }
const POSICAO = { latitude: -19.4687, longitude: -42.5367 }
const DESTINO = { lat: -19.8097, lng: -43.1733 }

export const fluxo = {
  nome: 'Atualizar pela minha localização (GPS e OSRM simulados)',
  async executar(h) {
    const { esperar, igual, passo, botao, abrirDemo, escolherCenario, lerBanco, escreverBanco, abrirTimeline, irParaAba, dialogoAberto } = h
    // Relógio real do navegador às 10:00 do dia da demonstração; depois de copiar a viagem para o espaço real, o app usa esse relógio.
    const { ctx, page } = await h.novaPagina({ relogioReal: '2026-11-14T10:00:00-03:00' })
    const origem = h.base.replace(/\/$/, '')
    await ctx.grantPermissions(['geolocation'], { origin: origem })
    await ctx.setGeolocation({ ...POSICAO, accuracy: 30 })

    const pedidos = []
    const modo = { osrm: 'ok' }
    await ctx.route('https://routing.openstreetmap.de/**', (rota) => {
      pedidos.push(rota.request().url())
      if (modo.osrm === 'fora') return rota.fulfill({ status: 503, headers: CORS, body: 'indisponível' })
      // 16 min 40 s de carro → 17 min (para cima) → × 1,15 = 20 min.
      return rota.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ code: 'Ok', routes: [{ duration: 1000, distance: 12400 }] }) })
    })

    const recalibracoes = async () => (await lerBanco(page, 'eventos', 'bordo')).filter((e) => e.tipo === 'recalibracao')
    const cartao = () => page.locator('[aria-label="Próxima parada"]')
    const previa = () => page.locator('[data-teste="loc-previa"]')
    const abrirFolha = async () => {
      await cartao().locator('[data-teste="atualizar-localizacao"]').click()
      await page.locator('dialog[open]').waitFor()
    }

    await abrirDemo(page)
    // Em viagem para o almoço (saiu de Monlevade às 09:14).
    await escolherCenario(page, 'Parada não planejada', 6)

    await passo('sem coordenadas no local da próxima parada, o botão não aparece', async () => {
      esperar((await cartao().locator('[data-teste="atualizar-localizacao"]').count()) === 0, 'sem coordenadas não deveria oferecer')
    })

    await passo('com coordenadas, o botão aparece no cartão e nenhuma chamada é feita antes do toque', async () => {
      const etapas = await lerBanco(page, 'etapas')
      const locais = await lerBanco(page, 'locais')
      const idLocal = etapas.find((e) => e.id === 'demo-almoco').localId
      await escreverBanco(page, 'locais', { ...locais.find((l) => l.id === idLocal), coordenadas: DESTINO })
      await h.copiarDemoParaReal(page)
      await page.goto(page.url())
      await cartao().waitFor()
      await cartao().locator('[data-teste="atualizar-localizacao"]').waitFor()
      igual(String(pedidos.length), '0', 'nada de rede antes do toque')
    })

    await passo('o botão também aparece na folha de Previsão, ao lado do campo de horário', async () => {
      await botao(page, 'Previsão', { exact: true }).click()
      await dialogoAberto(page).locator('[data-teste="atualizar-localizacao"]').waitFor()
      await dialogoAberto(page).locator('#recalibracao-hora').waitFor()
      await dialogoAberto(page).getByRole('button', { name: 'Cancelar' }).click()
    })

    await passo('a prévia mostra chegada, "sem trânsito", hora do cálculo e aplica o fator por padrão', async () => {
      await abrirFolha()
      await previa().waitFor()
      const texto = (await previa().innerText()).replace(/\s+/g, ' ')
      esperar(/Chegada em .* às 10:20/.test(texto), `prévia: ${texto}`)
      esperar(texto.includes('sem trânsito · calculado às 10:0'), `prévia: ${texto}`)
      esperar(texto.includes('carro 17 min × fator 1,15 = 20 min'), `prévia: ${texto}`)
      esperar(await dialogoAberto(page).getByLabel(/Aplicar fator ônibus/).isChecked(), 'o fator deveria vir ligado')
      igual(String(await recalibracoes().then((l) => l.length)), '0', 'nada é gravado antes de confirmar')
    })

    await passo('só as coordenadas vão ao OSRM, e a posição não aparece em nenhum registro', async () => {
      igual(String(pedidos.length), '1', 'uma chamada')
      igual(pedidos[0], 'https://routing.openstreetmap.de/routed-car/route/v1/driving/-42.5367,-19.4687;-43.1733,-19.8097?overview=false', 'URL só com coordenadas')
    })

    await passo('desligar o fator muda o horário na hora (só o tempo de carro)', async () => {
      await dialogoAberto(page).getByLabel(/Aplicar fator ônibus/).uncheck()
      esperar(/às 10:17/.test((await previa().innerText()).replace(/\s+/g, ' ')), 'sem o fator: 10:17')
      await dialogoAberto(page).getByLabel(/Aplicar fator ônibus/).check()
      esperar(/às 10:20/.test((await previa().innerText()).replace(/\s+/g, ' ')), 'com o fator: 10:20')
    })

    await passo('confirmar grava a recalibração com origem e hora do cálculo, e a timeline mostra a origem', async () => {
      await dialogoAberto(page).getByRole('button', { name: 'Atualizar previsão' }).click()
      await page.getByText(/Previsão atualizada para 10:20 \(pela localização\)/).waitFor()
      const [e] = await recalibracoes()
      igual(e.etapaId, 'demo-almoco', 'etapa')
      igual(e.dados.origem, 'localizacao', 'origem')
      esperar(/T10:0\d:00/.test(e.dados.calculadoEm) && /T10:20:00/.test(e.dados.horario), `dados: ${JSON.stringify(e.dados)}`)
      esperar(!JSON.stringify(e).includes('19.4687') && !JSON.stringify(e).includes('42.5367'), 'a posição do GPS não pode ser guardada')
      esperar(/Pela localização, sem trânsito, calculado às 10:0\d/.test(await cartao().innerText()), 'a origem aparece no cartão')
      await abrirTimeline(page)
      await page.getByText(/Pela localização, sem trânsito/).first().waitFor()
      await irParaAba(page, 'viagem')
    })

    await passo('DESFAZER retira a recalibração', async () => {
      await botao(page, 'DESFAZER').click()
      await page.waitForTimeout(300)
      igual(String((await recalibracoes()).length), '0', 'evento retirado')
      esperar(!(await cartao().innerText()).includes('Pela localização'), 'a origem some')
    })

    await passo('GPS impreciso (acima de 1 km): a prévia avisa "posição aproximada (±X km)" e ainda deixa confirmar', async () => {
      await ctx.setGeolocation({ ...POSICAO, accuracy: 2500 })
      await abrirFolha()
      await previa().waitFor()
      const aviso = await page.locator('[data-teste="loc-precisao"]').innerText()
      esperar(aviso.includes('posição aproximada (±2,5 km)'), `aviso: ${aviso}`)
      esperar(await dialogoAberto(page).getByRole('button', { name: 'Atualizar previsão' }).isEnabled(), 'o aviso não bloqueia')
      await dialogoAberto(page).getByRole('button', { name: 'Cancelar' }).click()
      await ctx.setGeolocation({ ...POSICAO, accuracy: 30 })
    })

    await passo('GPS com boa precisão não mostra o aviso', async () => {
      await abrirFolha()
      await previa().waitFor()
      igual(String(await page.locator('[data-teste="loc-precisao"]').count()), '0', 'sem aviso')
      await dialogoAberto(page).getByRole('button', { name: 'Cancelar' }).click()
    })

    await passo('permissão negada: mensagem clara e o horário do Google Maps continua disponível', async () => {
      await ctx.clearPermissions()
      await abrirFolha()
      const erro = await page.locator('[data-teste="loc-erro"]').innerText()
      esperar(/permissão/i.test(erro), `mensagem: ${erro}`)
      await dialogoAberto(page).getByRole('button', { name: /Digitar o horário/ }).click()
      await page.locator('#recalibracao-hora').waitFor()
      await dialogoAberto(page).getByRole('button', { name: 'Cancelar' }).click()
      await ctx.grantPermissions(['geolocation'], { origin: origem })
    })

    await passo('serviço de rotas fora do ar: mensagem clara, nada gravado', async () => {
      modo.osrm = 'fora'
      await abrirFolha()
      const erro = await page.locator('[data-teste="loc-erro"]').innerText()
      esperar(/fora do ar/.test(erro), `mensagem: ${erro}`)
      igual(String((await recalibracoes()).length), '0', 'nada gravado')
      modo.osrm = 'ok'
      await dialogoAberto(page).getByRole('button', { name: 'Tentar de novo' }).click()
      await previa().waitFor()
      await dialogoAberto(page).getByRole('button', { name: 'Cancelar' }).click()
    })

    await passo('sem internet: mensagem clara, sem pedir o GPS nem chamar a rede, e digitar o horário continua valendo', async () => {
      const antes = pedidos.length
      await ctx.setOffline(true)
      await abrirFolha()
      const erro = await page.locator('[data-teste="loc-erro"]').innerText()
      esperar(/Sem internet/.test(erro), `mensagem: ${erro}`)
      igual(String(pedidos.length), String(antes), 'nenhuma chamada')
      await dialogoAberto(page).getByRole('button', { name: /Digitar o horário/ }).click()
      await page.locator('#recalibracao-hora').fill('11:30')
      await dialogoAberto(page).getByRole('button', { name: 'Atualizar', exact: true }).click()
      await page.getByText(/Previsão atualizada para 11:30/).waitFor()
      const [e] = await recalibracoes()
      esperar(e.dados.origem === undefined, 'a recalibração digitada não leva origem')
      await ctx.setOffline(false)
    })

    await ctx.close()
  },
}
