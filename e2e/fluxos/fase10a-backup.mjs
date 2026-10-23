// Fase 10a: gerar o backup (menu de compartilhar simulado e download), restaurar num navegador
// limpo e continuar a viagem. A viagem é montada na demonstração (mesmo código e mesmas travas) e
// copiada para o banco real: o espaço real só roda com o relógio real, que aqui é fixado pelo
// Playwright (contexto A às 10:05, contexto B, o "celular novo", às 11:30 do mesmo dia).

import { readFileSync } from 'node:fs'

export const fluxo = {
  nome: 'Backup: gerar, restaurar em um navegador limpo e continuar a viagem',
  async executar(h) {
    const { esperar, igual, passo, botao, voltar, dialogoAberto, abrirDemo, escolherCenario, copiarDemoParaReal, lerBanco } = h
    const { ctx: ctxA, page: a } = await h.novaPagina({ relogioReal: '2026-11-14T10:05:00-03:00' })
    let arquivo = null

    await passo('a viagem com a parada não planejada aberta, no banco real, e a linha "Último backup: nunca"', async () => {
      await abrirDemo(a)
      await escolherCenario(a, 'Parada para café', 8)
      await copiarDemoParaReal(a)
      await a.goto(a.url())
      await a.getByText('Parada não planejada').first().waitFor()
      igual((await a.locator('[data-teste="linha-backup"]').innerText()).trim(), 'Último backup: nunca', 'linha do último backup')
      esperar(!(await a.locator('[data-teste="sugestao-backup"]').isVisible()), 'não deve sugerir backup durante a parada não planejada')
    })

    await passo('COMPARTILHAR: o arquivo sai como texto puro (.txt) pelo menu e a tela diz "arquivo gerado"', async () => {
      await voltar(a)
      await botao(a, 'BACKUP', { exact: true }).click()
      await a.getByText('contém os nomes dos passageiros').waitFor()
      esperar((await a.locator('.aviso').first().innerText()).includes('podem conter nomes'), 'aviso sobre observações e lugares')
      await botao(a, 'COMPARTILHAR BACKUP').click()
      await a.getByText(/Arquivo gerado e entregue ao menu de compartilhar/).waitFor()
      const compartilhados = await a.evaluate(() => window.__compartilhados)
      igual(String(compartilhados.length), '1', 'compartilhamentos')
      const f = compartilhados[0].arquivos[0]
      esperar(/^bordo-backup-2026-11-14-10\d\d\.txt$/.test(f.name), `nome do arquivo: ${f.name}`)
      igual(f.type, 'text/plain', 'tipo do arquivo')
      arquivo = f
      const json = JSON.parse(f.texto)
      igual(json.app, 'bordo', 'app')
      igual(String(json.formato), '1', 'formato')
      igual(String(json.conteudo.passageiros.length), '38', 'passageiros no arquivo')
      esperar(!('consultas' in json.conteudo), 'consultas ficaram de fora')
      esperar(!(await a.getByText(/backup enviado/i).isVisible()), 'a tela nunca diz "backup enviado"')
    })

    await passo('a tela Backup mostra o último backup de hoje', async () => {
      const t = await a.locator('[data-teste="ultimo-backup"]').innerText()
      esperar(/^Último backup: hoje 10:\d\d$/.test(t.trim()), `último backup: ${t}`)
    })

    await passo('BAIXAR ARQUIVO: o download tem o mesmo conteúdo', async () => {
      const [download] = await Promise.all([a.waitForEvent('download'), botao(a, 'BAIXAR ARQUIVO').click()])
      esperar(download.suggestedFilename().endsWith('.txt'), `download: ${download.suggestedFilename()}`)
      const baixado = JSON.parse(readFileSync(await download.path(), 'utf8'))
      igual(baixado.app, 'bordo', 'app do download')
      igual(JSON.stringify(baixado.conteudo), JSON.stringify(JSON.parse(arquivo.texto).conteudo), 'conteúdo do download')
    })
    await ctxA.close()

    const { ctx: ctxB, page: b } = await h.novaPagina({ relogioReal: '2026-11-14T11:30:00-03:00' })
    const original = JSON.parse(arquivo.texto).conteudo.viagens[0].planoOriginal
    await b.goto(h.base)

    await passo('arquivo inválido: de outro app e adulterado, com mensagem clara', async () => {
      await botao(b, 'BACKUP', { exact: true }).click()
      const entrada = b.locator('#arquivo-backup')
      await entrada.setInputFiles({ name: 'outro.json', mimeType: 'application/json', buffer: Buffer.from('{"app":"outro"}') })
      await b.getByText('Este arquivo não é um backup do Bordo.').waitFor()
      const adulterado = JSON.parse(arquivo.texto)
      adulterado.conteudo.viagens[0].nome = 'Outro nome'
      await entrada.setInputFiles({ name: arquivo.name, mimeType: 'text/plain', buffer: Buffer.from(JSON.stringify(adulterado)) })
      await b.getByText(/corrompido ou foi alterado/).waitFor()
    })

    await passo('o arquivo certo mostra o resumo e a viagem marcada; celular vazio, nada a substituir', async () => {
      await b.locator('#arquivo-backup').setInputFiles({ name: arquivo.name, mimeType: 'text/plain', buffer: Buffer.from(arquivo.texto) })
      const resumo = b.locator('[data-teste="resumo-backup"]')
      await resumo.waitFor()
      const t = await resumo.innerText()
      esperar(t.includes('Backup de 14/11/2026 10:'), `data do backup: ${t}`)
      esperar(t.includes('1 viagem') && t.includes('38 passageiros'), `resumo: ${t}`)
      esperar(t.includes('Em andamento'), `status: ${t}`)
      esperar(t.includes('Não há viagens no celular'), `celular vazio: ${t}`)
      esperar(await resumo.locator('input[type="checkbox"]').first().isChecked(), 'a viagem deveria vir marcada')
    })

    await passo('restaurar pede confirmação e termina com a opção de abrir a viagem', async () => {
      await botao(b, 'RESTAURAR VIAGENS ESCOLHIDAS').click()
      await dialogoAberto(b).getByRole('button', { name: 'Restaurar', exact: true }).click()
      await b.locator('[data-teste="restaurado"]').waitFor()
      await b.getByRole('button', { name: /^Abrir / }).click()
    })

    await passo('a tela principal avisa que foi restaurada e a parada continua aberta, com a linha do backup', async () => {
      const aviso = b.locator('[data-teste="aviso-restaurada"]')
      await aviso.waitFor()
      esperar((await aviso.innerText()).includes('Restaurada do backup de 14/11 10:'), `aviso: ${await aviso.innerText()}`)
      await b.getByText('Parada não planejada').first().waitFor()
      const linha = (await b.locator('[data-teste="linha-backup"]').innerText()).trim()
      esperar(/^Último backup: hoje 10:\d\d$/.test(linha), `linha: ${linha}`)
      await botao(b, 'Entendi').click()
      await aviso.waitFor({ state: 'detached' })
    })

    await passo('registro esquecido: a volta às 10:25 e a chegada de agora entram sem mudar o plano original', async () => {
      await botao(b, 'CHEGAMOS (sem registrar a volta antes)').click()
      await b.locator('#folha-hora').fill('10:25')
      await dialogoAberto(b).getByRole('button', { name: 'Confirmar' }).click()
      await b.getByText('Parados em').waitFor()
      // A folha opcional "Quem desceu?" pode abrir sozinha; se abrir, dispensa.
      if (await botao(b, 'Agora não').isVisible()) await botao(b, 'Agora não').click()
      const linha = (await b.locator('[data-teste="linha-backup"]').innerText()).trim()
      igual(linha, 'Último backup: hoje 10:05 · 2 registros depois', 'linha do último backup depois dos novos registros')
      const eventos = (await lerBanco(b, 'eventos', 'bordo')).sort((x, y) => x.sequencia - y.sequencia)
      const doArquivo = JSON.parse(arquivo.texto).conteudo.eventos
      const maior = Math.max(...doArquivo.map((e) => e.sequencia ?? 0))
      const fim = eventos.find((e) => e.tipo === 'parada_nao_planejada' && e.dados.fase === 'fim')
      esperar(!!fim, 'VOLTAMOS não gravado')
      igual(fim.horarioFato.slice(11, 16), '10:25', 'horário da volta')
      igual(String(fim.sequencia), String(maior + 1), 'a sequência continua a do arquivo')
      const chegada = eventos.find((e) => e.tipo === 'chegada' && e.etapaId === 'demo-almoco')
      esperar(!!chegada && chegada.horarioFato.slice(11, 15) === '11:3', 'chegada no horário de agora')
      const viagem = (await lerBanco(b, 'viagens', 'bordo'))[0]
      igual(JSON.stringify(viagem.planoOriginal), JSON.stringify(original), 'plano original')
      esperar(!eventos.some((e) => e.tipo === 'parada_nao_planejada' && e.dados.fase === 'inicio' && e.sequencia > maior), 'nenhum PARAMOS novo')
    })
    await ctxB.close()
  },
}
