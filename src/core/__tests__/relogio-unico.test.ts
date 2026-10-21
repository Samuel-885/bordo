// Regra 4 do CLAUDE.md: todo horário atual vem de agora(), em src/core/relogio.ts.

import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '..', '..')
const PERMITIDO = join('core', 'relogio.ts')
// Montado em partes para este arquivo não acusar a si mesmo.
const PROIBIDO = new RegExp(['Date', '\\.now\\s*\\(', '|new\\s+', 'Date\\s*\\(\\s*\\)'].join(''))

function arquivos(pasta: string): string[] {
  return readdirSync(pasta, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? arquivos(join(pasta, e.name)) : /\.tsx?$/.test(e.name) ? [join(pasta, e.name)] : [],
  )
}

describe('relógio único', () => {
  it('nenhum arquivo fora de relogio.ts lê o relógio do sistema', () => {
    const infratores = arquivos(SRC)
      .map((f) => relative(SRC, f))
      .filter((f) => f !== PERMITIDO && PROIBIDO.test(readFileSync(join(SRC, f), 'utf8')))
    expect(infratores).toEqual([])
  })
})
