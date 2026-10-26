// Previsão pela localização com trânsito (TomTom): a função de repasse, o TomTom, o OSRM e o GPS são
// simulados (nenhuma chamada sai para a internet; o TomTom nunca é chamado de verdade). Cobre o botão
// com os dois tempos lado a lado e a escolha de qual gravar, a reserva no OSRM com a função fora, o
// interruptor "Usar trânsito (TomTom)" de Mais (desligado, nenhuma chamada à função), o modo
// automático e o trecho em curso da inclusão de parada.

const CORS = { 'access-control-allow-origin': '*' }
const POSICAO = { latitude: -19.4687, longitude: -42.5367 }
const DESTINO = { lat: -19.8097, lng: -43.1733 }

export const fluxo = {
  nome: 'Previsão com trânsito: TomTom pela função, reserva no OSRM e interruptor (tudo simulado)',
  async executar(h) {
    const { aguardar, esperar, igual, passo, botao, abrirDemo, escolherCenario, lerBanco, escreverBanco, irParaAba, abrirItemDeMais, dialogoAberto } = h
    // Relógio real do navegador às 10:00; o tempo corre dali e `ctx.clock` avança os ciclos do automático.
    const { ctx, page } = await h.novaPagina({ relogioReal: '2026-11-14T10:00:00-03:00' })
    const origem = h.base.replace(/\/$/, '')
    await ctx.grantPermissions(['geolocation'], { origin: origem })
    await ctx.setGeolocation({ ...POSICAO, accuracy: 30 })

    const osrmPedidos = []
    const funcaoPedidos = []
    // `funcao`: ok | fora | sem_chave | cota. TomTom: 25 min com trânsito (× 1,15 = 29 min); OSRM: 17 min (× 1,15 = 20 min).
    const modo = { funcao: 'ok', tempoTomTom: 1500, osrm: 1000 }
    await ctx.route('https://routing.openstreetmap.de/**', (rota) => {
      osrmPedidos.push(rota.request().url())
      return rota.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ code: 'Ok', routes: [{ duration: modo.osrm, distance: 12400 }] }) })
    })
    await ctx.route('**/.netlify/functions/transito', (rota) => {
      const r = rota.request()
      funcaoPedidos.push({ metodo: r.method(), corpo: r.postData() })
      const erro = { fora: [502, 'fora'], sem_chave: [500, 'sem_chave'], cota: [429, 'cota_ou_chave'] }[modo.funcao]
      if (erro) return rota.fulfill({ status: erro[0], contentType: 'application/json', body: JSON.stringify({ erro: erro[1] }) })
      return rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tempoSegundos: modo.tempoTomTom, semTransitoSegundos: 1100, distanciaM: 12400 }) })
    })

    const recalibracoes = async () => (await lerBanco(page, 'eventos', 'bordo')).filter((e) => e.tipo === 'recalibracao').sort((a, b) => a.sequencia - b.sequencia)
    const cartao = () => page.locator('[aria-label="Próxima parada"]')
    const previa = () => page.locator('[data-teste="loc-previa"]')
    const texto = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ')
    const abrirFolha = async () => {
      await cartao().locator('[data-teste="atualizar-localizacao"]').click()
      await page.locator('dialog[open]').waitFor()
      await previa().waitFor()
    }
    const fecharFolha = () => dialogoAberto(page).getByRole('button', { name: 'Cancelar' }).click()
    const confirmar = async () => {
      await dialogoAberto(page).getByRole('button', { name: 'Atualizar previsão' }).click()
      await page.getByText(/Previsão atualizada para/).waitFor()
    }
    const desfazer = async () => {
      const antes = (await recalibracoes()).length
      await botao(page, 'DESFAZER').click()
      await aguardar(async () => (await recalibracoes()).length, antes - 1, 'o DESFAZER deveria retirar a recalibração')
    }
    const interruptorDeTransito = () => page.locator('[data-teste="usar-transito"]').getByRole('switch')
    const preferencia = () => page.evaluate(() => window.localStorage.getItem('bordo:usar-transito'))
    const mudarTransito = async (ligar) => {
      await irParaAba(page, 'mais')
      if (ligar) await interruptorDeTransito().check()
      else await interruptorDeTransito().uncheck()
      await irParaAba(page, 'viagem')
    }

    await abrirDemo(page)
    await escolherCenario(page, 'Parada não planejada', 6) // em viagem para o almoço
    {
      const etapas = await lerBanco(page, 'etapas')
      const locais = await lerBanco(page, 'locais')
      const idLocal = etapas.find((e) => e.id === 'demo-almoco').localId
      await escreverBanco(page, 'locais', { ...locais.find((l) => l.id === idLocal), coordenadas: DESTINO })
      await h.copiarDemoParaReal(page)
      await page.goto(page.url())
      await cartao().locator('[data-teste="atualizar-localizacao"]').waitFor()
    }

    await passo('o botão mostra os dois tempos lado a lado, com "Usar TomTom (com trânsito)" marcado por padrão', async () => {
      await abrirFolha()
      const escolha = await texto(page.locator('[data-teste="loc-escolha"]'))
      esperar(/Usar TomTom \(com trânsito\): 10:29/.test(escolha), `escolha: ${escolha}`)
      esperar(/Usar OSRM \(sem trânsito\): 10:20/.test(escolha), `escolha: ${escolha}`)
      esperar(await page.locator('[data-teste="loc-opcao-tomtom"]').locator('xpath=preceding-sibling::input').isChecked(), 'TomTom deveria vir marcado')
      const t = await texto(previa())
      esperar(/Chegada em .* às 10:29/.test(t), `prévia: ${t}`)
      esperar(/com trânsito \(TomTom\) · calculado às 10:0\d/.test(t), `prévia: ${t}`)
      igual(String((await recalibracoes()).length), '0', 'nada é gravado antes de confirmar')
    })

    await passo('só as coordenadas vão à função (POST) e ao OSRM; nada de rede antes do toque', async () => {
      igual(String(funcaoPedidos.length), '1', 'uma chamada à função')
      igual(funcaoPedidos[0].metodo, 'POST', 'método')
      igual(funcaoPedidos[0].corpo, JSON.stringify({ origem: { lat: -19.4687, lng: -42.5367 }, destino: DESTINO }), 'corpo só com as coordenadas')
      igual(String(osrmPedidos.length), '1', 'uma chamada ao OSRM (para comparar)')
    })

    await passo('o fator ônibus continua por cima do tempo com trânsito, e o interruptor muda o horário na hora', async () => {
      esperar((await texto(previa())).includes('carro 25 min × fator 1,15 = 29 min'), 'fator sobre o tempo com trânsito')
      await dialogoAberto(page).getByLabel(/Aplicar fator ônibus/).uncheck()
      esperar(/Chegada em .* às 10:25/.test(await texto(previa())), 'sem o fator: 10:25')
      await dialogoAberto(page).getByLabel(/Aplicar fator ônibus/).check()
      esperar(/Chegada em .* às 10:29/.test(await texto(previa())), 'com o fator: 10:29')
    })

    await passo('confirmar com o TomTom grava servico "tomtom"; o cartão diz "com trânsito (TomTom)"; a posição não é guardada', async () => {
      await confirmar()
      const [e] = await recalibracoes()
      igual(e.dados.origem, 'localizacao', 'origem continua "localizacao"')
      igual(e.dados.servico, 'tomtom', 'serviço')
      esperar(/T10:29:00/.test(e.dados.horario), `horário: ${e.dados.horario}`)
      esperar(!JSON.stringify(e).includes('19.4687') && !JSON.stringify(e).includes('42.5367'), 'a posição do GPS não pode ser guardada')
      esperar(/Pela localização, com trânsito \(TomTom\), calculado às 10:0\d/.test(await cartao().innerText()), 'origem no cartão')
      await desfazer()
    })

    await passo('escolher "Usar OSRM (sem trânsito)": o horário e o serviço gravado seguem a escolha', async () => {
      await abrirFolha()
      await page.locator('[data-teste="loc-opcao-osrm"]').click()
      const t = await texto(previa())
      esperar(/Chegada em .* às 10:20/.test(t) && t.includes('sem trânsito (OSRM) · calculado às'), `prévia: ${t}`)
      await confirmar()
      const [e] = await recalibracoes()
      igual(e.dados.servico, 'osrm', 'serviço')
      esperar(/T10:20:00/.test(e.dados.horario), `horário: ${e.dados.horario}`)
      esperar(/Pela localização, sem trânsito \(OSRM\), calculado às 10:0\d/.test(await cartao().innerText()), 'origem no cartão')
      await desfazer()
    })

    for (const [funcao, trecho] of [['fora', /fora do ar/], ['sem_chave', /não está configurado/], ['cota', /cota esgotada/]]) {
      await passo(`função ${funcao}: vale o OSRM, a tela diz "sem trânsito (OSRM)" e explica por quê, sem travar`, async () => {
        modo.funcao = funcao
        await abrirFolha()
        const t = await texto(previa())
        esperar(/Chegada em .* às 10:20/.test(t) && t.includes('sem trânsito (OSRM)'), `prévia: ${t}`)
        igual(String(await page.locator('[data-teste="loc-escolha"]').count()), '0', 'sem a escolha dos dois tempos')
        esperar(trecho.test(await texto(page.locator('[data-teste="loc-reserva"]'))), 'o motivo deveria aparecer')
        await confirmar()
        igual((await recalibracoes())[0].dados.servico, 'osrm', 'serviço gravado')
        await desfazer()
      })
    }
    modo.funcao = 'ok'

    await passo('interruptor "Usar trânsito (TomTom)" em Mais: ligado por padrão, guardado só no aparelho (localStorage)', async () => {
      await irParaAba(page, 'mais')
      esperar(await interruptorDeTransito().isChecked(), 'deveria vir ligado')
      igual(String(await preferencia()), 'null', 'nada guardado enquanto é o padrão')
      await interruptorDeTransito().uncheck()
      igual(String(await preferencia()), 'desligado', 'preferência guardada')
      const meta = await lerBanco(page, 'meta', 'bordo').catch(() => [])
      esperar(!JSON.stringify(meta).includes('transito') && !JSON.stringify(await recalibracoes()).includes('desligado'), 'a preferência não vai para o banco')
      await irParaAba(page, 'viagem')
    })

    await passo('desligado: o botão não chama a função, usa só o OSRM e os textos dizem "sem trânsito (OSRM)"', async () => {
      const antesFuncao = funcaoPedidos.length
      const antesOsrm = osrmPedidos.length
      await abrirFolha()
      const t = await texto(previa())
      esperar(/Chegada em .* às 10:20/.test(t) && t.includes('sem trânsito (OSRM)'), `prévia: ${t}`)
      igual(String(await page.locator('[data-teste="loc-escolha"]').count()), '0', 'sem a escolha dos dois tempos')
      igual(String(await page.locator('[data-teste="loc-reserva"]').count()), '0', 'sem aviso de falha: foi escolha da pessoa')
      await confirmar()
      igual((await recalibracoes())[0].dados.servico, 'osrm', 'serviço gravado')
      await desfazer()
      igual(String(funcaoPedidos.length), String(antesFuncao), 'nenhuma chamada à função')
      igual(String(osrmPedidos.length), String(antesOsrm + 1), 'só o OSRM')
    })

    await passo('desligado, a inclusão de parada em trânsito também usa só o OSRM, sem chamar a função', async () => {
      const antesFuncao = funcaoPedidos.length
      await abrirItemDeMais(page, 'Incluir parada')
      await page.locator('[data-teste="mudanca-de-roteiro"]').waitFor()
      await botao(page, 'Cadastrar novo local').click()
      await page.locator('#l-nome').fill('Mirante do Vale')
      await page.locator('#l-cidade').fill('Cidade X')
      await page.locator('#l-coord').fill('-19.9, -43.1')
      await botao(page, 'Salvar local').click()
      await page.locator('#mr-local').waitFor()
      await page.locator('[data-teste="mr-ate-calculado"]').waitFor()
      const ate = await texto(page.locator('[data-teste="mr-ate-calculado"]'))
      esperar(/^Até Mirante do Vale: 20 min · pela sua localização, sem trânsito \(OSRM\), calculado às 10:\d\d$/.test(ate), `até: ${ate}`)
      igual(String(funcaoPedidos.length), String(antesFuncao), 'nenhuma chamada à função')
      await page.goto(page.url())
      await cartao().waitFor()
    })

    await passo('ligado de novo, o trecho em curso da inclusão usa o TomTom ("Recalcular")', async () => {
      await mudarTransito(true)
      await abrirItemDeMais(page, 'Incluir parada')
      await page.locator('[data-teste="mudanca-de-roteiro"]').waitFor()
      await page.locator('#mr-local').selectOption({ label: 'Mirante do Vale · Cidade X' })
      await page.locator('[data-teste="mr-ate-calculado"]').waitFor()
      const antes = funcaoPedidos.length
      await page.locator('[data-teste="mr-ate-recalcular"]').click()
      await aguardar(() => funcaoPedidos.length, antes + 1, 'o trecho em curso deveria chamar a função')
      await aguardar(async () => texto(page.locator('[data-teste="mr-ate-calculado"]')), (t) => /^Até Mirante do Vale: 29 min · pela sua localização, com trânsito \(TomTom\), calculado às 10:\d\d$/.test(t), 'texto com o TomTom')
    })

    await passo('inclusão com a função fora: reserva no OSRM, sem travar', async () => {
      modo.funcao = 'fora'
      await page.locator('[data-teste="mr-ate-recalcular"]').click()
      await aguardar(async () => texto(page.locator('[data-teste="mr-ate-calculado"]')), (t) => /sem trânsito \(OSRM\)/.test(t), 'texto com o OSRM')
      modo.funcao = 'ok'
      await page.goto(page.url())
      await cartao().waitFor()
    })

    // ---------------- Modo automático ----------------
    const cinco = () => ctx.clock.runFor('05:00')

    await passo('automático usa o TomTom (com a reserva só se ele falhar) e grava servico "tomtom"', async () => {
      const antesFuncao = funcaoPedidos.length
      const antesOsrm = osrmPedidos.length
      await cartao().getByRole('switch').check()
      await aguardar(async () => (await recalibracoes()).length, 1, 'deveria gravar a primeira atualização')
      const [e] = await recalibracoes()
      igual(String(e.dados.automatica), 'true', 'marca automática')
      igual(e.dados.servico, 'tomtom', 'serviço')
      esperar(/T10:\d\d:00/.test(e.dados.horario), `horário: ${e.dados.horario}`)
      igual(String(funcaoPedidos.length), String(antesFuncao + 1), 'uma chamada à função')
      igual(String(osrmPedidos.length), String(antesOsrm), 'o OSRM nem é chamado quando o TomTom responde')
      await aguardar(() => cartao().innerText().then((t) => /Atualizado pela localização às 10:\d\d, com trânsito \(TomTom\)/.test(t)), true, 'origem no cartão')
    })

    await passo('automático com a função fora: vale o OSRM e o cartão diz "sem trânsito (OSRM)"', async () => {
      modo.funcao = 'fora'
      modo.osrm = 2400 // 40 min de carro → 46 min: bem diferente da previsão anterior
      await cinco()
      await aguardar(async () => (await recalibracoes()).length, 2, 'deveria gravar com o OSRM')
      igual((await recalibracoes())[1].dados.servico, 'osrm', 'serviço')
      await aguardar(() => cartao().innerText().then((t) => /Atualizado pela localização às 10:\d\d, sem trânsito \(OSRM\)/.test(t)), true, 'origem no cartão')
    })

    await passo('automático com o interruptor desligado: nenhuma chamada à função, só o OSRM', async () => {
      modo.funcao = 'ok'
      modo.osrm = 1000
      await mudarTransito(false)
      const antesFuncao = funcaoPedidos.length
      const antesOsrm = osrmPedidos.length
      await cinco()
      await aguardar(() => osrmPedidos.length, antesOsrm + 1, 'o ciclo deveria usar o OSRM')
      await aguardar(async () => (await recalibracoes()).length, 3, 'deveria gravar com o OSRM')
      igual(String(funcaoPedidos.length), String(antesFuncao), 'nenhuma chamada à função com o interruptor desligado')
      igual((await recalibracoes())[2].dados.servico, 'osrm', 'serviço')
      await cartao().getByRole('switch').uncheck()
    })

    await ctx.close()
  },
}
