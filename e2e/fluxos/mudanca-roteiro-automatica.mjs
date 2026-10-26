// Mudança de roteiro em viagem com os dois tempos calculados sozinhos: GPS e OSRM simulados (nenhuma
// chamada sai para a internet). Cobre inclusão em trânsito e parado, local sem coordenadas, sem
// internet, GPS negado, "Usar outro tempo" e a prévia por localização que vence em 2 minutos.

const CORS = { 'access-control-allow-origin': '*' }
const POSICAO = { latitude: -19.4687, longitude: -42.5367 }
const ALMOCO = { lat: -19.8097, lng: -43.1733 }
const MONLEVADE = { lat: -19.8108, lng: -43.1769 }

export const fluxo = {
  nome: 'Mudança de roteiro: tempos calculados sozinhos (GPS e OSRM simulados)',
  async executar(h) {
    const { aguardar, esperar, igual, passo, botao, abrirDemo, escolherCenario, lerBanco, escreverBanco, abrirItemDeMais, abrirParadas } = h
    const origem = h.base.replace(/\/$/, '')
    const CORPO = JSON.stringify({ code: 'Ok', routes: [{ duration: 1000, distance: 12400 }] })

    /** Página com a viagem copiada para o espaço real, o relógio do navegador no horário combinado e o OSRM simulado. */
    async function preparar(cenario, passos, relogioReal, { gps }) {
      const { ctx, page } = await h.novaPagina({ relogioReal })
      if (gps) {
        await ctx.grantPermissions(['geolocation'], { origin: origem })
        await ctx.setGeolocation({ ...POSICAO, accuracy: 30 })
      }
      const pedidos = []
      await ctx.route('https://routing.openstreetmap.de/**', (rota) => {
        pedidos.push(rota.request().url())
        // 16 min 40 s de carro → 17 min (para cima) → × 1,15 = 20 min.
        return rota.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: CORPO })
      })
      await abrirDemo(page)
      await escolherCenario(page, cenario, passos)
      const locais = await lerBanco(page, 'locais')
      const etapas = await lerBanco(page, 'etapas')
      const comCoord = async (etapaId, coordenadas) => {
        const idLocal = etapas.find((e) => e.id === etapaId).localId
        await escreverBanco(page, 'locais', { ...locais.find((l) => l.id === idLocal), coordenadas })
      }
      await comCoord('demo-almoco', ALMOCO)
      await comCoord('demo-monlevade', MONLEVADE)
      await h.copiarDemoParaReal(page)
      await page.goto(page.url())
      await page.locator('[aria-label="Próxima parada"]').waitFor()
      return { ctx, page, pedidos }
    }

    const eventosReais = async (page) => (await lerBanco(page, 'eventos', 'bordo')).sort((a, b) => (a.sequencia ?? 0) - (b.sequencia ?? 0))
    const texto = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ')
    const tela = (page) => page.locator('[data-teste="mudanca-de-roteiro"]')
    const abrir = async (page) => {
      await abrirItemDeMais(page, 'Incluir parada')
      await tela(page).waitFor()
    }
    async function cadastrar(page, nome, coordenadas) {
      await botao(page, 'Cadastrar novo local').click()
      await page.locator('#l-nome').fill(nome)
      await page.locator('#l-cidade').fill('Cidade X')
      if (coordenadas) await page.locator('#l-coord').fill(coordenadas)
      await botao(page, 'Salvar local').click()
      await page.locator('#mr-local').waitFor()
    }
    const escolher = (page, nome) => page.locator('#mr-local').selectOption({ label: `${nome} · Cidade X` })
    const desfazer = async (page) => {
      const antes = (await eventosReais(page)).length
      await botao(page, 'DESFAZER').click()
      await aguardar(async () => (await eventosReais(page)).length < antes, true, 'o DESFAZER deveria retirar os eventos')
    }

    // ---------- Em trânsito (para o almoço, saiu de Monlevade) ----------
    const t = await preparar('Recalibração pelo Google Maps', 6, '2026-11-14T10:00:00-03:00', { gps: true })
    const { page, ctx, pedidos } = t

    await passo('em trânsito: ao escolher o local, os dois trechos são calculados sozinhos, sem tocar em nada', async () => {
      await abrir(page)
      await cadastrar(page, 'Mirante do Vale', '-19.9, -43.1')
      await page.locator('[data-teste="mr-ate-calculado"]').waitFor()
      await page.locator('[data-teste="mr-de-calculado"]').waitFor()
      const ate = await texto(page.locator('[data-teste="mr-ate-calculado"]'))
      esperar(/^Até Mirante do Vale: 20 min · pela sua localização, sem trânsito, calculado às 10:0\d$/.test(ate), `até: ${ate}`)
      const de = await texto(page.locator('[data-teste="mr-de-calculado"]'))
      esperar(/^De Mirante do Vale até .+: 20 min · pela rota \(carro 17 min × 1,15\)$/.test(de), `de: ${de}`)
      igual(String(pedidos.length), '2', 'uma chamada por trecho')
    })

    await passo('os campos de digitar ficam fechados e só as coordenadas vão ao OSRM', async () => {
      for (const id of ['#mr-ate-m', '#mr-ate-h', '#mr-de-m', '#mr-de-h', '#mr-chegada']) {
        igual(String(await page.locator(id).count()), '0', `${id} deveria estar fechado`)
      }
      const urls = pedidos.join(' ')
      esperar(urls.includes('-42.5367,-19.4687;-19.9') === false && urls.includes('-42.5367,-19.4687;-43.1,-19.9'), `URLs: ${urls}`)
      esperar(urls.includes('-43.1,-19.9;-43.1733,-19.8097'), `URLs: ${urls}`)
      esperar((await texto(tela(page))).includes('a sua posição não é guardada'), 'o texto de privacidade deveria aparecer')
    })

    await passo('a prévia aparece e INCLUIR PARADA grava a parada com a recalibração marcada como "localizacao"', async () => {
      await page.locator('[data-teste="mudanca-previa"]').waitFor()
      const previa = await texto(page.locator('[data-teste="mudanca-previa"]'))
      esperar(/Chegada em Mirante do Vale: 10:2\d/.test(previa), `prévia: ${previa}`)
      await botao(page, 'INCLUIR PARADA').click()
      await page.getByText('Parada incluída: Mirante do Vale.').waitFor()
      const eventos = await eventosReais(page)
      const [parada, recal] = eventos.slice(-2)
      igual(`${parada.tipo},${recal.tipo}`, 'parada_incluida,recalibracao', 'eventos')
      igual(recal.dados.origem, 'localizacao', 'origem')
      esperar(/T10:0\d:00/.test(recal.dados.calculadoEm) && /T10:2\d:00/.test(recal.dados.horario), `dados: ${JSON.stringify(recal.dados)}`)
      igual(String(parada.dados.trechos.length), '1', 'em trânsito só o trecho do local novo até a etapa seguinte é um trecho')
      igual(parada.dados.trechos[0].fonte, 'rota', 'fonte do trecho')
      esperar(!JSON.stringify(eventos).includes('19.4687') && !JSON.stringify(eventos).includes('42.5367'), 'a posição do GPS não pode ser guardada')
      await desfazer(page)
    })

    await passo('a prévia por localização vence em 2 minutos: o botão vira "Recalcular e revisar" e o registro só vem no toque seguinte', async () => {
      await abrir(page)
      await escolher(page, 'Mirante do Vale')
      await page.locator('[data-teste="mr-ate-calculado"]').waitFor()
      const antes = pedidos.length
      await ctx.clock.fastForward('03:00')
      await page.locator('[data-teste="mr-ate-vencida"]').waitFor()
      esperar(await botao(page, 'Recalcular e revisar').isVisible(), 'o botão deveria virar "Recalcular e revisar"')
      igual(String(await botao(page, 'INCLUIR PARADA').count()), '0', 'não deveria oferecer INCLUIR PARADA com a prévia vencida')
      const n = (await eventosReais(page)).length
      await botao(page, 'Recalcular e revisar').click()
      await botao(page, 'INCLUIR PARADA').waitFor()
      igual(String(pedidos.length), String(antes + 1), 'uma chamada nova, só do trecho em curso')
      igual(String((await eventosReais(page)).length), String(n), 'nada gravado ainda')
      esperar(/calculado às 10:0[3-9]/.test(await texto(page.locator('[data-teste="mr-ate-calculado"]'))), 'o horário do cálculo deveria ser novo')
      await botao(page, 'INCLUIR PARADA').click()
      await page.getByText('Parada incluída: Mirante do Vale.').waitFor()
      const [, recal] = (await eventosReais(page)).slice(-2)
      esperar(/T10:0[3-9]:00/.test(recal.dados.calculadoEm) && /T10:2[3-9]:00/.test(recal.dados.horario), `dados: ${JSON.stringify(recal.dados)}`)
      await desfazer(page)
    })

    await passo('"Usar outro tempo": campos abertos já preenchidos, aviso de qual tempo vale, "Voltar ao calculado" desfaz', async () => {
      await abrir(page)
      await escolher(page, 'Mirante do Vale')
      await page.locator('[data-teste="mr-de-calculado"]').waitFor()
      await page.locator('[data-teste="mr-ate-outro"]').click()
      esperar(/^\d\d:\d\d$/.test(await page.locator('#mr-chegada').inputValue()), 'o horário do Maps deveria vir preenchido com o calculado')
      esperar((await texto(page.locator('[data-teste="mr-ate-valendo"]'))).includes('Vale o tempo digitado, não o calculado (20 min)'), 'deveria dizer qual tempo vale')
      igual(String(await page.locator('[data-teste="mr-ate-calculado"]').count()), '0', 'o texto calculado some enquanto vale o digitado')
      await page.locator('[data-teste="mr-ate-voltar"]').click()
      await page.locator('[data-teste="mr-ate-calculado"]').waitFor()
      igual(String(await page.locator('#mr-chegada').count()), '0', 'campos fechados de novo')
      // Agora no trecho seguinte: horas e minutos já vêm com o tempo de ônibus (0h20).
      await page.locator('[data-teste="mr-de-outro"]').click()
      igual(await page.locator('#mr-de-h').inputValue(), '0', 'horas preenchidas')
      igual(await page.locator('#mr-de-m').inputValue(), '20', 'minutos preenchidos')
      esperar((await texto(page.locator('[data-teste="mr-de-valendo"]'))).includes('Vale o tempo digitado'), 'deveria dizer qual tempo vale')
      await page.locator('#mr-de-m').fill('25')
      await page.locator('[data-teste="mr-ate-outro"]').click()
      await page.locator('#mr-chegada').fill('10:45')
      await page.locator('[data-teste="mudanca-previa"]').waitFor()
      await botao(page, 'INCLUIR PARADA').click()
      await page.getByText('Parada incluída: Mirante do Vale.').waitFor()
      const [parada, recal] = (await eventosReais(page)).slice(-2)
      igual(parada.dados.trechos[0].fonte, 'manual', 'o trecho digitado é manual')
      igual(String(parada.dados.trechos[0].duracaoMin), '25', 'duração digitada')
      igual(recal.dados.origem, undefined, 'chegada pelo Maps não leva a origem "localizacao"')
      esperar(/T10:45:00/.test(recal.dados.horario), `horário: ${recal.dados.horario}`)
      await desfazer(page)
    })

    await passo('local sem coordenadas: diz qual trecho não foi calculado e por quê, e os campos já vêm abertos; nada é chamado', async () => {
      await abrir(page)
      await cadastrar(page, 'Cachoeira', '')
      await escolher(page, 'Cachoeira')
      const antes = pedidos.length
      const ate = await texto(page.locator('[data-teste="mr-ate-erro"]'))
      esperar(ate.includes('Até Cachoeira: não foi calculado') && ate.includes('Sem coordenadas em Cachoeira'), `até: ${ate}`)
      const de = await texto(page.locator('[data-teste="mr-de-erro"]'))
      esperar(de.includes('não foi calculado') && de.includes('Sem coordenadas em Cachoeira'), `de: ${de}`)
      await page.locator('#mr-chegada').waitFor()
      await page.locator('#mr-de-h').waitFor()
      igual(String(pedidos.length), String(antes), 'nenhuma chamada')
      esperar(await botao(page, 'INCLUIR PARADA').isDisabled(), 'sem os tempos não inclui')
      await page.locator('#mr-chegada').fill('10:50')
      await page.locator('#mr-de-h').fill('1')
      await botao(page, 'INCLUIR PARADA').waitFor()
      esperar(await botao(page, 'INCLUIR PARADA').isEnabled(), 'com os tempos digitados, inclui')
    })

    await passo('GPS negado: o trecho em curso não é calculado (mensagem clara, Maps aberto) e o outro continua calculado', async () => {
      await ctx.clearPermissions()
      await escolher(page, 'Mirante do Vale')
      await page.locator('[data-teste="mr-ate-erro"]').waitFor()
      const ate = await texto(page.locator('[data-teste="mr-ate-erro"]'))
      esperar(/Até Mirante do Vale: não foi calculado/.test(ate) && /permissão/i.test(ate), `até: ${ate}`)
      await page.locator('#mr-chegada').waitFor()
      await page.locator('[data-teste="mr-de-calculado"]').waitFor()
      esperar(await botao(page, 'INCLUIR PARADA').isDisabled(), 'falta o tempo do trecho em curso')
      await page.locator('#mr-chegada').fill('10:40')
      esperar(await botao(page, 'INCLUIR PARADA').isEnabled(), 'com a chegada informada, inclui')
      await ctx.grantPermissions(['geolocation'], { origin: origem })
    })

    await passo('sem internet: avisa os dois trechos, nada é chamado; ao voltar a internet, calcula sozinho', async () => {
      await escolher(page, 'Cachoeira')
      const antes = pedidos.length
      await ctx.setOffline(true)
      await escolher(page, 'Mirante do Vale')
      const ate = await texto(page.locator('[data-teste="mr-ate-erro"]'))
      esperar(ate.includes('Sem internet'), `até: ${ate}`)
      esperar((await texto(page.locator('[data-teste="mr-de-erro"]'))).includes('Sem internet'), 'de: Sem internet')
      await page.locator('#mr-chegada').waitFor()
      await page.locator('#mr-de-h').waitFor()
      igual(String(pedidos.length), String(antes), 'nenhuma chamada sem internet')
      await ctx.setOffline(false)
      await page.locator('[data-teste="mr-ate-calculado"]').waitFor()
      await page.locator('[data-teste="mr-de-calculado"]').waitFor()
    })
    await ctx.close()

    // ---------- Parado em Monlevade (sem GPS: a posição não é usada) ----------
    const p = await preparar('Chegada atrasada em Monlevade', 'todos', '2026-11-14T09:00:00-03:00', { gps: false })
    await passo('parado: o trecho até o local novo sai da rota do local onde estamos, sem pedir o GPS', async () => {
      await abrir(p.page)
      await cadastrar(p.page, 'Mirante do Vale', '-19.9, -43.1')
      await p.page.locator('[data-teste="mr-ate-calculado"]').waitFor()
      await p.page.locator('[data-teste="mr-de-calculado"]').waitFor()
      const ate = await texto(p.page.locator('[data-teste="mr-ate-calculado"]'))
      esperar(/^De .+ até Mirante do Vale: 20 min · pela rota \(carro 17 min × 1,15\)$/.test(ate), `até: ${ate}`)
      esperar(p.pedidos.some((u) => u.includes('-43.1769,-19.8108;-43.1,-19.9')), `URLs: ${p.pedidos.join(' ')}`)
      await botao(p.page, 'INCLUIR PARADA').click()
      await p.page.getByText('Parada incluída: Mirante do Vale.').waitFor()
      const eventos = await eventosReais(p.page)
      const [parada] = eventos.slice(-1)
      igual(parada.tipo, 'parada_incluida', 'evento')
      igual(String(parada.dados.trechos.length), '2', 'os dois trechos')
      esperar(parada.dados.trechos.every((x) => x.fonte === 'rota' && x.duracaoMin === 17), `trechos: ${JSON.stringify(parada.dados.trechos)}`)
    })
    await p.ctx.close()
  },
}
