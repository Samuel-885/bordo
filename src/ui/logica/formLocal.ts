// Modelo do formulário de novo local e a validação.

import type { Local, OnibusPara } from '../../core/tipos'
import { lerCoordenadas } from './coordenadas'

export interface FormLocal {
  nome: string
  cidade: string
  tipo: string
  /** Texto colado, "lat, lng". */
  coordenadas: string
  abre: string
  fecha: string
  telefone: string
  onibusPara: OnibusPara
  observacoes: string
}

export function formularioLocalVazio(): FormLocal {
  return {
    nome: '',
    cidade: '',
    tipo: 'restaurante',
    coordenadas: '',
    abre: '',
    fecha: '',
    telefone: '',
    onibusPara: 'nao_sei',
    observacoes: '',
  }
}

export type ErrosLocal = Partial<Record<'nome' | 'cidade' | 'coordenadas' | 'horario', string>>

export function validarLocal(f: FormLocal): ErrosLocal {
  const erros: ErrosLocal = {}
  if (!f.nome.trim()) erros.nome = 'Informe o nome.'
  if (!f.cidade.trim()) erros.cidade = 'Informe a cidade.'
  if (f.coordenadas.trim()) {
    const c = lerCoordenadas(f.coordenadas)
    if (!c.ok) erros.coordenadas = c.motivo
  }
  if (Boolean(f.abre) !== Boolean(f.fecha)) erros.horario = 'Preencha quando abre e quando fecha, ou deixe os dois vazios.'
  return erros
}

/** Só chamar com o formulário válido. Campos opcionais vazios ficam de fora. */
export function localDoFormulario(f: FormLocal, id: string): Local {
  const c = f.coordenadas.trim() ? lerCoordenadas(f.coordenadas) : null
  const local: Local = {
    id,
    nome: f.nome.trim(),
    cidade: f.cidade.trim(),
    tipo: f.tipo,
    onibusPara: f.onibusPara,
  }
  if (c?.ok) local.coordenadas = c.coordenadas
  if (f.abre && f.fecha) {
    local.abre = f.abre
    local.fecha = f.fecha
  }
  if (f.telefone.trim()) local.telefone = f.telefone.trim()
  if (f.observacoes.trim()) local.observacoes = f.observacoes.trim()
  return local
}
