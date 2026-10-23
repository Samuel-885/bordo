// Ajudas dos testes de ponta a ponta: navegador, contexto com `navigator` simulado, atalhos da
// demonstração e leitura direta do IndexedDB. Tudo roda contra o build servido pelo preview.

import { mkdirSync } from 'node:fs'

const PASTA_CAPTURAS = new URL('./capturas/', import.meta.url).pathname

export function criarAjudas({ browser, base }) {
  let paginaAtual = null
  let nomeDoFluxo = ''
  let contadorDeFalhas = 0
  const resultados = []
  const errosDaPagina = []

  const esperar = (cond, msg) => {
    if (!cond) throw new Error(msg)
  }
  const igual = (obtido, esperado, msg) =>
    esperar(obtido === esperado, `${msg}\n--- obtido:\n${obtido}\n--- esperado:\n${esperado}`)

  async function passo(nome, fn) {
    try {
      await fn()
      resultados.push({ fluxo: nomeDoFluxo, nome, ok: true })
      console.log(`  ok    ${nome}`)
    } catch (e) {
      const erro = String(e.message ?? e).split('\n').slice(0, 8).join('\n        ')
      resultados.push({ fluxo: nomeDoFluxo, nome, ok: false, erro })
      console.log(`  FALHA ${nome}\n        ${erro}`)
      if (paginaAtual) {
        contadorDeFalhas += 1
        mkdirSync(PASTA_CAPTURAS, { recursive: true })
        const arquivo = `${PASTA_CAPTURAS}${nomeDoFluxo.replace(/\W+/g, '-')}-${contadorDeFalhas}.png`
        await paginaAtual.screenshot({ path: arquivo, fullPage: true }).catch(() => {})
        console.log(`        captura: ${arquivo}`)
      }
    }
  }

  /**
   * Contexto novo (armazenamento limpo, ~390 px), com a área de transferência liberada e
   * `navigator.share` e `window.open` simulados: `window.__compartilhados` e `window.__abertos`
   * guardam o que o app tentou compartilhar e abrir.
   */
  async function novaPagina({ comShare = true, relogioReal = null } = {}) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
    // Espaço real com o relógio do navegador num horário combinado (o tempo segue correndo dali).
    if (relogioReal) await ctx.clock.install({ time: new Date(relogioReal) })
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base.replace(/\/$/, '') })
    await ctx.addInitScript((comShare) => {
      window.__compartilhados = []
      window.__abertos = []
      if (comShare) {
        // Como o Chrome do Android: só aceita arquivos de alguns tipos (texto puro, não JSON).
        navigator.canShare = (dados) => !dados.files || dados.files.every((f) => ['text/plain', 'application/pdf', 'image/png'].includes(f.type))
        navigator.share = async (dados) => {
          if (!dados.files) {
            window.__compartilhados.push(dados)
            return
          }
          const arquivos = await Promise.all(dados.files.map(async (f) => ({ name: f.name, type: f.type, texto: await f.text() })))
          window.__compartilhados.push({ ...dados, files: undefined, arquivos })
        }
      } else {
        Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })
        Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true })
      }
      window.open = (url) => {
        window.__abertos.push(String(url))
        return {}
      }
    }, comShare)
    const page = await ctx.newPage()
    page.setDefaultTimeout(8000)
    page.on('pageerror', (e) => errosDaPagina.push({ fluxo: nomeDoFluxo, mensagem: e.message }))
    paginaAtual = page
    return { ctx, page }
  }

  const botao = (page, nome, opcoes = {}) => page.getByRole('button', { name: nome, ...opcoes })
  /** O botão "‹" do cabeçalho. */
  const voltar = (page) => page.locator('header.topo button').first().click()
  /** Muda de aba pela barra de baixo: viagem, roteiro, pessoas, locais ou mais. */
  const irParaAba = async (page, aba) => {
    await page.locator(`.barra-abas [data-aba="${aba}"]`).click()
    await page.waitForTimeout(150)
  }
  /** Abre um item da aba Mais (vai para a aba antes). `nome` casa com o começo do nome do botão. */
  const abrirItemDeMais = async (page, nome) => {
    await irParaAba(page, 'mais')
    await page.locator('.item-menu', { hasText: nome }).first().click()
  }
  /** Aba Roteiro, visão Timeline. */
  const abrirTimeline = async (page) => {
    await irParaAba(page, 'roteiro')
    await page.getByRole('tab', { name: 'Timeline' }).click()
  }
  /** Aba Roteiro, visão Paradas. */
  const abrirParadas = async (page) => {
    await irParaAba(page, 'roteiro')
    await page.getByRole('tab', { name: 'Paradas' }).click()
  }
  /** Aba Roteiro, "Comparar e escolher": a tela de alternativas. */
  const abrirAlternativas = async (page) => {
    await abrirParadas(page)
    await page.getByRole('button', { name: /Comparar e escolher/ }).click()
  }
  /** Os botões da barra de ação (o rodapé fixo acima das abas). */
  const rodape = (page) => page.locator('.barra-acao')
  /** A folha ou o diálogo aberto no momento. */
  const dialogoAberto = (page) => page.locator('dialog[open]').last()

  async function abrirDemo(page) {
    await page.goto(base)
    await botao(page, 'Abrir a demonstração').click()
    await page.getByText('MODO DEMONSTRAÇÃO').waitFor()
  }

  async function abrirControles(page) {
    if (!(await page.locator('#demo-cenario').isVisible().catch(() => false))) await botao(page, 'Controles').click()
  }
  async function fecharControles(page) {
    if (await page.locator('#demo-cenario').isVisible().catch(() => false)) await botao(page, 'Fechar').first().click()
  }

  /** Roda `n` passos do cenário (ou todos, com 'todos') e deixa a tela principal da viagem aberta. */
  async function escolherCenario(page, nome, passos = 'todos') {
    await abrirControles(page)
    await page.locator('#demo-cenario').selectOption({ label: nome })
    await page.locator('.rodape-fixo').waitFor()
    const total = passos === 'todos' ? 50 : passos
    for (let i = 0; i < total; i++) {
      const proximo = botao(page, 'Próximo passo')
      if (!(await proximo.isEnabled().catch(() => false))) break
      await proximo.click()
      await page.waitForTimeout(120)
    }
    await fecharControles(page)
  }

  async function defineRelogio(page, hora) {
    await abrirControles(page)
    await page.locator('#demo-hora').fill(hora)
    await botao(page, 'Definir', { exact: true }).click()
    await fecharControles(page)
    await page.waitForTimeout(150)
  }

  const lerBanco = (page, loja, banco = 'bordo-demo') =>
    page.evaluate(
      ([loja, banco]) =>
        new Promise((resolve, reject) => {
          const r = indexedDB.open(banco)
          r.onerror = () => reject(r.error)
          r.onsuccess = () => {
            const db = r.result
            const q = db.transaction(loja, 'readonly').objectStore(loja).getAll()
            q.onsuccess = () => {
              db.close()
              resolve(q.result)
            }
          }
        }),
      [loja, banco],
    )

  /** Copia as tabelas do banco da demonstração para o banco real (o celular "de verdade" com a viagem pronta). */
  const copiarDemoParaReal = (page) =>
    page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const tabelas = ['viagens', 'etapas', 'locais', 'trechos', 'eventos', 'passageiros', 'modelos']
          const abrir = (nome) =>
            new Promise((ok, erro) => {
              const r = indexedDB.open(nome)
              r.onerror = () => erro(r.error)
              r.onsuccess = () => ok(r.result)
            })
          const ler = (db, loja) =>
            new Promise((ok, erro) => {
              const q = db.transaction(loja, 'readonly').objectStore(loja).getAll()
              q.onsuccess = () => ok(q.result)
              q.onerror = () => erro(q.error)
            })
          Promise.all([abrir('bordo-demo'), abrir('bordo')])
            .then(async ([demo, real]) => {
              for (const t of tabelas) {
                const linhas = await ler(demo, t)
                await new Promise((ok, erro) => {
                  const tx = real.transaction(t, 'readwrite')
                  for (const l of linhas) tx.objectStore(t).put(l)
                  tx.oncomplete = () => ok(true)
                  tx.onerror = () => erro(tx.error)
                })
              }
              demo.close()
              real.close()
              resolve(true)
            })
            .catch(reject)
        }),
    )

  const escreverBanco = (page, loja, linha) =>
    page.evaluate(
      ([loja, linha]) =>
        new Promise((resolve, reject) => {
          const r = indexedDB.open('bordo-demo')
          r.onerror = () => reject(r.error)
          r.onsuccess = () => {
            const db = r.result
            const tx = db.transaction(loja, 'readwrite')
            tx.objectStore(loja).put(linha)
            tx.oncomplete = () => {
              db.close()
              resolve(true)
            }
          }
        }),
      [loja, linha],
    )

  /** Apaga uma linha pela chave primária (ou limpa a loja, sem chave). */
  const apagarDoBanco = (page, loja, chave) =>
    page.evaluate(
      ([loja, chave]) =>
        new Promise((resolve, reject) => {
          const r = indexedDB.open('bordo-demo')
          r.onerror = () => reject(r.error)
          r.onsuccess = () => {
            const db = r.result
            const tx = db.transaction(loja, 'readwrite')
            if (chave === undefined) tx.objectStore(loja).clear()
            else tx.objectStore(loja).delete(chave)
            tx.oncomplete = () => {
              db.close()
              resolve(true)
            }
          }
        }),
      [loja, chave],
    )

  /** Tipos dos eventos da viagem, na ordem de gravação. */
  const tiposDosEventos = async (page) =>
    (await lerBanco(page, 'eventos')).sort((a, b) => (a.sequencia ?? 0) - (b.sequencia ?? 0)).map((e) => e.tipo)

  const textoPrevia = (page) => page.locator('#mensagem-texto').inputValue()

  /** Entra num fluxo: os passos e as capturas levam o nome dele. */
  function iniciarFluxo(nome) {
    nomeDoFluxo = nome
    console.log(`\n${nome}`)
  }

  return {
    base, esperar, igual, passo, novaPagina, botao, voltar, irParaAba, abrirItemDeMais, abrirTimeline, abrirParadas, abrirAlternativas, rodape, dialogoAberto, abrirDemo, escolherCenario, defineRelogio,
    lerBanco, copiarDemoParaReal, escreverBanco, apagarDoBanco, tiposDosEventos, textoPrevia, iniciarFluxo,
    resultados, errosDaPagina,
  }
}
