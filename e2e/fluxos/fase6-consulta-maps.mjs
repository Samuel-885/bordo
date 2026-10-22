export const fluxo = {
  nome: 'Fase 6: consultar alternativas pelo Google Maps (CONSULTAR NO MAPS)',
  async executar(h) {
    const { esperar, igual, passo, botao, voltar, abrirDemo, escolherCenario, lerBanco, tiposDosEventos, dialogoAberto } = h
    const { ctx, page } = await h.novaPagina()
    await abrirDemo(page)
    // Saímos de Monlevade às 09:14 e são 11:40, a caminho do almoço (Restaurante A, chegada 12:34).
    await escolherCenario(page, 'Recalibração pelo Google Maps', 7)
    await botao(page, 'VER ALTERNATIVAS').click()
    await page.locator('.alternativa').first().waitFor()

    const alternativa = (nome) => page.locator('.alternativa', { hasText: nome })
    const consultar = async (nome, hora) => {
      await alternativa(nome).getByRole('button', { name: 'CONSULTAR NO MAPS' }).click()
      await page.getByText(`Chegada no ${nome} pelo Google Maps`).waitFor()
      await page.locator('#recalibracao-hora').fill(hora)
      await dialogoAberto(page).getByRole('button', { name: 'Calcular' }).click()
      await alternativa(nome).locator('.consulta-maps').waitFor()
    }
    const base = { eventos: 0 }

    await passo('consultar o Restaurante C recalcula só aquela alternativa, sem evento e sem mexer na previsão', async () => {
      base.eventos = (await lerBanco(page, 'eventos')).length
      await consultar('Restaurante C', '13:05')
      const c = await alternativa('Restaurante C').innerText()
      esperar(c.includes('13:05'), `a chegada de C deveria ser 13:05: ${c}`)
      esperar(c.includes('Google Maps, informado às 11:40'), `origem da consulta ausente: ${c}`)
      igual(String((await lerBanco(page, 'eventos')).length), String(base.eventos), 'eventos depois da consulta')
      igual(String((await lerBanco(page, 'consultas')).length), '1', 'consultas guardadas')
      esperar((await alternativa('Restaurante A').innerText()).includes('12:34'), 'a previsão de A não deveria mudar')
    })

    await passo('ESCOLHER com consulta vigente grava troca + recalibração juntas', async () => {
      await alternativa('Restaurante C').getByRole('button', { name: 'ESCOLHER' }).click()
      await page.getByText('Local trocado para Restaurante C, com a chegada do Google Maps.').waitFor()
      const novos = (await tiposDosEventos(page)).slice(base.eventos)
      igual(novos.join(','), 'troca_local,recalibracao', 'eventos novos')
      const recal = (await lerBanco(page, 'eventos')).find((e) => e.tipo === 'recalibracao')
      igual(recal.dados.horario.slice(11, 16), '13:05', 'horário da recalibração')
      igual(String((await lerBanco(page, 'consultas')).length), '0', 'a consulta usada é consumida')
    })

    await passo('DESFAZER retira os dois eventos juntos', async () => {
      await botao(page, 'DESFAZER').click()
      await page.waitForTimeout(300)
      igual(String((await lerBanco(page, 'eventos')).length), String(base.eventos), 'eventos depois do desfazer')
    })

    await passo('consulta no local já escolhido vira ATUALIZAR PREVISÃO (só a recalibração)', async () => {
      await consultar('Restaurante A', '12:50')
      await alternativa('Restaurante A').getByRole('button', { name: 'ATUALIZAR PREVISÃO' }).click()
      await page.getByText('Previsão atualizada pela consulta ao Google Maps.').waitFor()
      igual((await tiposDosEventos(page)).slice(base.eventos).join(','), 'recalibracao', 'eventos novos')
      await voltar(page)
      await page.locator('.estado-viagem').waitFor()
      const prox = await page.locator('section[aria-label="Próxima etapa"]').innerText()
      esperar(prox.includes('12:50') && prox.includes('Google Maps, informado às 11:40'), `próxima etapa inesperada: ${prox}`)
    })

    await passo('DESCARTAR CONSULTA apaga a consulta sem tocar nos eventos', async () => {
      await botao(page, 'VER ALTERNATIVAS').click()
      await page.locator('.alternativa').first().waitFor()
      await consultar('Restaurante B', '13:20')
      igual(String((await lerBanco(page, 'consultas')).length), '1', 'consultas antes de descartar')
      const antes = (await lerBanco(page, 'eventos')).length
      await alternativa('Restaurante B').getByRole('button', { name: 'DESCARTAR CONSULTA' }).click()
      await page.waitForTimeout(300)
      igual(String((await lerBanco(page, 'consultas')).length), '0', 'consultas depois de descartar')
      igual(String((await lerBanco(page, 'eventos')).length), String(antes), 'eventos')
    })

    await passo('a consulta antiga (depois de 30 min) fica marcada e não vale', async () => {
      await consultar('Restaurante B', '13:30')
      await h.defineRelogio(page, '12:15')
      // Em trânsito, uma consulta cujo horário já passou, ou com mais de 30 min, vira "antiga".
      await page.waitForTimeout(300)
      const texto = await alternativa('Restaurante B').locator('.consulta-maps').innerText()
      esperar(texto.startsWith('Consulta antiga'), `a consulta deveria estar antiga: ${texto}`)
    })
    await ctx.close()
  },
}
