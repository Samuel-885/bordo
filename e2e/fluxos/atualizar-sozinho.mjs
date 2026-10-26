// Atualizar sozinho a cada 5 minutos pela localização: GPS, OSRM e relógio simulados (nenhuma
// chamada sai para a internet). Cobre ligar (primeira leitura na hora), o ciclo de 5 minutos,
// a diferença pequena, GPS impreciso, falhas sem gravar, pausa parado e volta, segundo plano, a
// timeline (sem as automáticas), o DESFAZER (ausente) e desligar sozinho ao chegar.

const CORS = { 'access-control-allow-origin': '*' }
const POSICAO = { latitude: -19.4687, longitude: -42.5367 }
const DESTINO = { lat: -19.8097, lng: -43.1733 }

export const fluxo = {
  nome: 'Atualizar sozinho a cada 5 minutos (GPS, OSRM e relógio simulados)',
  async executar(h) {
    const { aguardar, esperar, igual, passo, botao, abrirDemo, escolherCenario, lerBanco, escreverBanco, abrirTimeline, irParaAba } = h
    const origem = h.base.replace(/\/$/, '')

    /** Prepara a viagem no espaço real, com o relógio do navegador num horário combinado e o OSRM simulado. */
    async function preparar(relogioReal, cenario, passos, idEtapa) {
      const { ctx, page } = await h.novaPagina({ relogioReal })
      // Bloqueio de tela simulado: conta os bloqueios que estão ativos agora.
      await ctx.addInitScript(() => {
        window.__bloqueios = { ativos: 0, pedidos: 0 }
        Object.defineProperty(navigator, 'wakeLock', {
          configurable: true,
          value: {
            request: async () => {
              window.__bloqueios.ativos += 1
              window.__bloqueios.pedidos += 1
              const s = { released: false, release: async () => { if (!s.released) { s.released = true; window.__bloqueios.ativos -= 1 } } }
              return s
            },
          },
        })
      })
      await ctx.grantPermissions(['geolocation'], { origin: origem })
      await ctx.setGeolocation({ ...POSICAO, accuracy: 30 })
      const pedidos = []
      const modo = { osrm: 'ok', duracao: 1000 }
      await ctx.route('https://routing.openstreetmap.de/**', (rota) => {
        pedidos.push(rota.request().url())
        if (modo.osrm === 'fora') return rota.fulfill({ status: 503, headers: CORS, body: 'indisponível' })
        return rota.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ code: 'Ok', routes: [{ duration: modo.duracao, distance: 12400 }] }) })
      })
      await abrirDemo(page)
      await escolherCenario(page, cenario, passos)
      const etapas = await lerBanco(page, 'etapas')
      const locais = await lerBanco(page, 'locais')
      const idLocal = etapas.find((e) => e.id === idEtapa).localId
      await escreverBanco(page, 'locais', { ...locais.find((l) => l.id === idLocal), coordenadas: DESTINO })
      await h.copiarDemoParaReal(page)
      await page.goto(page.url())
      await page.locator('[aria-label="Próxima parada"]').waitFor()
      return { ctx, page, pedidos, modo }
    }

    const recalibracoes = (page) => lerBanco(page, 'eventos', 'bordo').then((l) => l.filter((e) => e.tipo === 'recalibracao').sort((a, b) => a.sequencia - b.sequencia))
    const cartao = (page) => page.locator('[aria-label="Próxima parada"]')
    const interruptor = (page) => cartao(page).getByRole('switch')
    const estado = async (page) => (await cartao(page).locator('[data-teste="atualizar-sozinho-estado"]').allInnerTexts()).join(' | ')
    const preferencia = (page) => page.evaluate(() => window.localStorage.getItem('bordo:atualizar-sozinho'))
    const visibilidade = (page, v) =>
      page.evaluate((v) => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v })
        document.dispatchEvent(new Event('visibilitychange'))
      }, v)
    const telaAcesa = (page) => page.evaluate(() => window.__bloqueios.ativos)
    const viagemDe = async (page) => (await lerBanco(page, 'viagens', 'bordo'))[0].id
    const cinco = (ctx) => ctx.clock.runFor('05:00')

    // ---------------- Viagem em trânsito para o almoço ----------------
    const { ctx, page, pedidos, modo } = await preparar('2026-11-14T10:00:00-03:00', 'Parada não planejada', 6, 'demo-almoco')

    const viagemId = await viagemDe(page)

    await passo('desligado por padrão, com o aviso de que só funciona com o app aberto na tela; nenhuma chamada antes de ligar', async () => {
      esperar(!(await interruptor(page).isChecked()), 'deveria vir desligado')
      const texto = await cartao(page).locator('[data-teste="atualizar-sozinho"]').innerText()
      esperar(/Atualizar sozinho a cada 5 minutos/.test(texto), `texto: ${texto}`)
      esperar(/Só funciona com o app aberto na tela/.test(texto), `texto: ${texto}`)
      igual(String(pedidos.length), '0', 'nada de rede')
      igual(String(await preferencia(page)), 'null', 'nada guardado')
      igual(String(await telaAcesa(page)), '0', 'a tela não fica acesa com o modo desligado')
    })

    await passo('o interruptor também está em Mais, no mesmo estado', async () => {
      await irParaAba(page, 'mais')
      esperar(!(await page.locator('.item-tema').getByRole('switch').isChecked()), 'em Mais também desligado')
      await irParaAba(page, 'viagem')
    })

    await passo('ligar atualiza na hora e grava a recalibração sozinha, com origem, cálculo e a marca "automatica"', async () => {
      await interruptor(page).check()
      await aguardar(async () => (await recalibracoes(page)).length, 1, 'deveria gravar a primeira atualização')
      const [e] = await recalibracoes(page)
      igual(e.etapaId, 'demo-almoco', 'etapa')
      igual(e.dados.origem, 'localizacao', 'origem')
      igual(String(e.dados.automatica), 'true', 'marca automática')
      esperar(/T10:0\d:00/.test(e.dados.calculadoEm) && /T10:2\d:00/.test(e.dados.horario), `dados: ${JSON.stringify(e.dados)}`)
      esperar(!JSON.stringify(e).includes('19.4687') && !JSON.stringify(e).includes('42.5367'), 'a posição do GPS não pode ser guardada')
      igual(await preferencia(page), viagemId, 'a preferência guarda o id da viagem em que foi ligada')
      await aguardar(() => telaAcesa(page), 1, 'a tela fica acesa enquanto atualiza')
    })

    await passo('o cartão diz "atualizado pela localização" e a última atualização; sem DESFAZER nem aviso', async () => {
      await aguardar(() => cartao(page).innerText().then((t) => /Atualizado pela localização às 10:0\d, sem trânsito/.test(t)), true, 'origem da previsão no cartão')
      await aguardar(() => estado(page), (t) => /Última atualização às 10:0\d/.test(t), 'última atualização')
      igual(String(await botao(page, 'DESFAZER').count()), '0', 'DESFAZER não aparece')
      igual(String(await page.getByText(/Previsão atualizada para/).count()), '0', 'nenhum aviso de registro')
    })

    await passo('nenhuma atualização aparece na timeline; o Mais mostra o mesmo interruptor ligado', async () => {
      await abrirTimeline(page)
      await page.getByText(/Saímos de/).first().waitFor()
      igual(String(await page.getByText(/Previsão atualizada para/).count()), '0', 'a timeline não mostra atualizações')
      await irParaAba(page, 'mais')
      esperar(await page.locator('.item-tema').getByRole('switch').isChecked(), 'em Mais também ligado')
      await irParaAba(page, 'viagem')
    })

    await passo('no ciclo de 5 minutos atualiza de novo (relógio simulado)', async () => {
      modo.duracao = 2400 // 40 min de carro → 46 min de ônibus
      const antes = pedidos.length
      await cinco(ctx)
      await aguardar(async () => (await recalibracoes(page)).length, 2, 'deveria gravar a segunda atualização')
      igual(String(pedidos.length), String(antes + 1), 'uma chamada por ciclo')
      const e = (await recalibracoes(page))[1]
      esperar(/T10:5[0-2]:00/.test(e.dados.horario), `horário: ${e.dados.horario}`)
      igual(String(e.dados.automatica), 'true', 'marca automática')
    })

    await passo('diferença menor que 2 min da previsão atual: não grava, mas a última atualização avança', async () => {
      modo.duracao = 2160 // 36 min de carro → 42 min: 1 min de diferença
      const antes = pedidos.length
      await cinco(ctx)
      await aguardar(() => pedidos.length, antes + 1, 'o ciclo deveria rodar')
      await aguardar(() => estado(page), (t) => /Última atualização às 10:1\d/.test(t), 'última atualização avançou')
      igual(String((await recalibracoes(page)).length), '2', 'nada gravado')
    })

    await passo('GPS impreciso (acima de 1 km): não chama a rede, nunca grava, e o cartão diz o motivo', async () => {
      await ctx.setGeolocation({ ...POSICAO, accuracy: 2500 })
      modo.duracao = 600
      const antes = pedidos.length
      await cinco(ctx)
      await aguardar(() => estado(page), (t) => /posição aproximada demais/.test(t) && /Tenta de novo às 10:2\d/.test(t), 'motivo da falha')
      igual(String(pedidos.length), String(antes), 'GPS impreciso termina o ciclo sem chamar a rede')
      igual(String((await recalibracoes(page)).length), '2', 'nada gravado')
      await ctx.setGeolocation({ ...POSICAO, accuracy: 30 })
    })

    await passo('serviço fora: não grava, mostra "última atualização" e o motivo, e tenta de novo no ciclo seguinte', async () => {
      modo.osrm = 'fora'
      const antes = pedidos.length
      await cinco(ctx)
      await aguardar(() => estado(page), (t) => /fora do ar/.test(t) && /Última atualização às 10:1\d/.test(t) && /Tenta de novo às/.test(t), 'motivo e última atualização')
      igual(String((await recalibracoes(page)).length), '2', 'nada gravado')
      esperar(pedidos.length > antes, 'tentou')
    })

    await passo('sem internet: não chama a rede nem grava, e o cartão diz "sem internet ou sinal fraco"', async () => {
      await ctx.setOffline(true)
      const antes = pedidos.length
      await cinco(ctx)
      await aguardar(() => estado(page), (t) => /sem internet ou sinal fraco/.test(t), 'motivo')
      igual(String(pedidos.length), String(antes), 'nenhuma chamada')
      igual(String((await recalibracoes(page)).length), '2', 'nada gravado')
      await ctx.setOffline(false)
    })

    await passo('quando tudo volta, o ciclo seguinte grava e a falha some', async () => {
      modo.osrm = 'ok'
      modo.duracao = 3000 // 50 min de carro → 58 min
      await cinco(ctx)
      await aguardar(async () => (await recalibracoes(page)).length, 3, 'deveria gravar de novo')
      await aguardar(() => estado(page), (t) => !/Não atualizou/.test(t), 'a falha some')
    })

    await passo('em segundo plano para; ao voltar, atualiza na hora', async () => {
      await visibilidade(page, 'hidden')
      const antes = pedidos.length
      await cinco(ctx)
      await cinco(ctx)
      igual(String(pedidos.length), String(antes), 'nenhuma chamada em segundo plano')
      modo.duracao = 2400
      await visibilidade(page, 'visible')
      await aguardar(() => pedidos.length, antes + 1, 'deveria atualizar assim que volta')
      await aguardar(async () => (await recalibracoes(page)).length, 4, 'e gravar')
    })

    await passo('parado (depois do CHEGAMOS): pausa sozinho e diz por quê, sem chamar a rede', async () => {
      await botao(page, 'CHEGAMOS').click()
      await page.getByText(/Chegada registrada às/).waitFor()
      await aguardar(() => estado(page), (t) => /Pausado: parados/.test(t), 'motivo da pausa')
      await aguardar(() => telaAcesa(page), 0, 'pausado solta o bloqueio da tela')
      const antes = pedidos.length
      await cinco(ctx)
      await cinco(ctx)
      igual(String(pedidos.length), String(antes), 'pausado não chama a rede')
      igual(String((await recalibracoes(page)).length), '4', 'pausado não grava')
      esperar(await interruptor(page).isChecked(), 'o modo segue ligado')
    })

    await passo('voltando à condição (em trânsito de novo), volta a atualizar na hora', async () => {
      // O DESFAZER do CHEGAMOS já venceu (o relógio avançou); desfaz o registro no banco e avisa a tela.
      const chegada = (await lerBanco(page, 'eventos', 'bordo')).find((e) => e.tipo === 'chegada' && e.etapaId === 'demo-almoco')
      await page.evaluate(
        (id) =>
          new Promise((resolve, reject) => {
            const r = indexedDB.open('bordo')
            r.onerror = () => reject(r.error)
            r.onsuccess = () => {
              const tx = r.result.transaction('eventos', 'readwrite')
              tx.objectStore('eventos').delete(id)
              tx.oncomplete = () => {
                r.result.close()
                window.dispatchEvent(new Event('bordo:mudou'))
                resolve(true)
              }
            }
          }),
        chegada.id,
      )
      const antes = pedidos.length
      await aguardar(() => pedidos.length, antes + 1, 'deveria retomar assim que a condição volta')
      await aguardar(() => estado(page), (t) => !/Pausado/.test(t), 'sai da pausa')
      await aguardar(() => telaAcesa(page), 1, 'ativo de novo pede o bloqueio da tela outra vez')
    })

    await passo('em outra viagem o interruptor aparece desligado, não atualiza e a preferência da viagem em andamento fica intacta', async () => {
      // Simula "ligado em outra viagem": a preferência guarda o id de outra.
      await page.evaluate(() => window.localStorage.setItem('bordo:atualizar-sozinho', 'outra-viagem'))
      await page.goto(page.url())
      await cartao(page).waitFor()
      esperar(!(await interruptor(page).isChecked()), 'nesta viagem o interruptor deveria aparecer desligado')
      await aguardar(() => telaAcesa(page), 0, 'sem modo, sem tela acesa')
      const antes = pedidos.length
      await cinco(ctx)
      await cinco(ctx)
      igual(String(pedidos.length), String(antes), 'não atualiza em outra viagem')
      igual(await preferencia(page), 'outra-viagem', 'abrir esta viagem não mexe na preferência da outra')
      await irParaAba(page, 'mais')
      esperar(!(await page.locator('.item-tema').getByRole('switch').isChecked()), 'em Mais também desligado')
      await irParaAba(page, 'viagem')
    })

    await passo('ligar nesta viagem passa a preferência para ela e atualiza', async () => {
      const antes = pedidos.length
      await interruptor(page).check()
      igual(await preferencia(page), viagemId, 'a preferência passou para esta viagem')
      await aguardar(() => pedidos.length, antes + 1, 'deveria atualizar assim que liga')
    })

    await passo('desligar para de atualizar e zera a preferência', async () => {
      await interruptor(page).uncheck()
      igual(String(await preferencia(page)), 'null', 'preferência zerada')
      await aguardar(() => telaAcesa(page), 0, 'desligado solta a tela')
      const antes = pedidos.length
      await cinco(ctx)
      await cinco(ctx)
      igual(String(pedidos.length), String(antes), 'desligado não chama a rede')
    })

    await ctx.close()

    // ---------------- Último trecho: continua até o CHEGAMOS final ----------------
    const fim = await preparar('2026-11-14T21:40:00-03:00', 'Chegada ao destino', 18, 'demo-destino')

    await passo('o destino como próxima parada, em trânsito: continua atualizando', async () => {
      await interruptor(fim.page).check()
      await aguardar(async () => (await recalibracoes(fim.page)).length, 1, 'deveria gravar')
      const [e] = await recalibracoes(fim.page)
      igual(e.etapaId, 'demo-destino', 'etapa')
      igual(String(e.dados.automatica), 'true', 'marca automática')
      fim.modo.duracao = 2400
      await cinco(fim.ctx)
      await aguardar(async () => (await recalibracoes(fim.page)).length, 2, 'e no ciclo seguinte')
    })

    await passo('o CHEGAMOS final conclui a viagem: o modo desliga sozinho e a preferência é zerada', async () => {
      await botao(fim.page, 'CHEGAMOS').click()
      await aguardar(() => preferencia(fim.page), (v) => v === null, 'preferência zerada ao concluir a viagem em que foi ligada')
      const antes = fim.pedidos.length
      await cinco(fim.ctx)
      igual(String(fim.pedidos.length), String(antes), 'concluída não chama a rede')
      igual(String((await lerBanco(fim.page, 'eventos', 'bordo')).filter((e) => e.tipo === 'fim').length), '1', 'viagem concluída')
    })

    await passo('abrir uma viagem concluída que não é a do modo não mexe na preferência', async () => {
      await fim.page.evaluate(() => window.localStorage.setItem('bordo:atualizar-sozinho', 'outra-viagem'))
      await fim.page.goto(fim.page.url())
      // Recarregar volta à lista de viagens: abre a concluída.
      await fim.page.getByText('Viagem de demonstração').first().click()
      await fim.page.getByText(/Chegamos/).first().waitFor()
      await cinco(fim.ctx)
      igual(await preferencia(fim.page), 'outra-viagem', 'a preferência da outra viagem continua')
    })

    await fim.ctx.close()
  },
}
