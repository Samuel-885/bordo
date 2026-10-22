// Testes de ponta a ponta (Chromium sem tela). `npm run e2e` faz o build, sobe o `vite preview`
// numa porta livre, roda os fluxos de e2e/fluxos e encerra tudo no fim.
//
// Opções: --sem-build (usa o dist que já existe) e --filtro=texto (só os fluxos cujo arquivo ou
// nome contém o texto). Fora do `npm test`: precisa do Chromium do Playwright instalado
// (`npx playwright-core install chromium`) e leva alguns minutos.

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { createServer } from 'node:net'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { chromium } from 'playwright-core'
import { criarAjudas } from './ajudas.mjs'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const semBuild = args.includes('--sem-build')
const filtro = args.find((a) => a.startsWith('--filtro='))?.slice('--filtro='.length)

let preview = null
let browser = null
const encerrar = () => {
  preview?.kill()
  preview = null
}
process.on('exit', encerrar)
for (const sinal of ['SIGINT', 'SIGTERM']) {
  process.on(sinal, () => {
    encerrar()
    process.exit(130)
  })
}

function portaLivre() {
  return new Promise((resolve, reject) => {
    const s = createServer()
    s.once('error', reject)
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => resolve(port))
    })
  })
}

async function esperarServidor(base) {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base)).ok) return
    } catch {
      // Ainda subindo.
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('O vite preview não respondeu a tempo.')
}

async function principal() {
  if (!semBuild) {
    console.log('Build do app...')
    const b = spawnSync('npm', ['run', 'build'], { cwd: raiz, stdio: 'inherit' })
    if (b.status !== 0) throw new Error('O build falhou.')
  } else if (!existsSync(join(raiz, 'dist/index.html'))) {
    throw new Error('Não há dist/: rode sem --sem-build.')
  }

  const caminhoDoChrome = process.env.CHROME_PATH ?? chromium.executablePath()
  if (!existsSync(caminhoDoChrome)) {
    throw new Error(`Chromium não encontrado em ${caminhoDoChrome}. Instale com: npx playwright-core install chromium (ou defina CHROME_PATH).`)
  }

  const porta = await portaLivre()
  const base = `http://127.0.0.1:${porta}/`
  preview = spawn(process.execPath, [join(raiz, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(porta), '--strictPort', '--host', '127.0.0.1'], {
    cwd: raiz,
    stdio: 'ignore',
  })
  await esperarServidor(base)

  browser = await chromium.launch({ executablePath: caminhoDoChrome, args: ['--no-sandbox'] })
  const ajudas = criarAjudas({ browser, base })

  const pasta = join(dirname(fileURLToPath(import.meta.url)), 'fluxos')
  const arquivos = readdirSync(pasta).filter((f) => f.endsWith('.mjs')).sort()
  let rodou = 0
  for (const arquivo of arquivos) {
    const { fluxo } = await import(pathToFileURL(join(pasta, arquivo)).href)
    if (filtro && !arquivo.includes(filtro) && !fluxo.nome.toLowerCase().includes(filtro.toLowerCase())) continue
    rodou += 1
    ajudas.iniciarFluxo(`${fluxo.nome}  [${arquivo}]`)
    try {
      await fluxo.executar(ajudas)
    } catch (e) {
      ajudas.resultados.push({ fluxo: fluxo.nome, nome: 'o fluxo inteiro', ok: false, erro: String(e.message ?? e) })
      console.log(`  FALHA (fluxo interrompido) ${e.message ?? e}`)
    }
  }
  await browser.close()
  browser = null
  encerrar()

  const falhas = ajudas.resultados.filter((r) => !r.ok)
  const ok = ajudas.resultados.length - falhas.length
  console.log(`\n${rodou} fluxos, ${ok}/${ajudas.resultados.length} passos ok`)
  if (ajudas.errosDaPagina.length > 0) {
    console.log('Erros não tratados na página:')
    for (const e of ajudas.errosDaPagina) console.log(` - [${e.fluxo}] ${e.mensagem}`)
  }
  if (falhas.length > 0) {
    console.log('FALHAS:')
    for (const f of falhas) console.log(` - [${f.fluxo}] ${f.nome}`)
  }
  if (rodou === 0) {
    console.log('Nenhum fluxo rodou (confira o --filtro).')
    return 1
  }
  return falhas.length > 0 || ajudas.errosDaPagina.length > 0 ? 1 : 0
}

principal().then(
  (codigo) => process.exit(codigo),
  async (e) => {
    console.error(`\ne2e: ${e.message ?? e}`)
    await browser?.close().catch(() => {})
    process.exit(1)
  },
)
