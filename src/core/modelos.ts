// Modelos das mensagens (atualização e restaurante): texto livre com variáveis entre chaves,
// que o app preenche ao gerar. Funções puras. Nenhuma variável expõe nome de passageiro.

export type IdModelo = 'atualizacao' | 'restaurante'

export interface VariavelDoModelo {
  nome: string
  descricao: string
  /** Valor de exemplo, para a prévia quando não há viagem iniciada. */
  exemplo: string
}

export const VARIAVEIS_DA_ATUALIZACAO: readonly VariavelDoModelo[] = [
  { nome: 'identificacao', descricao: 'Identificação da viagem (por exemplo, a unidade).', exemplo: 'Unidade Exemplo — Ipatinga' },
  { nome: 'situacao', descricao: 'Aguardando saída, em viagem, parados em um local, parada não planejada ou chegamos.', exemplo: 'em viagem' },
  { nome: 'proxima_parada', descricao: 'Nome da próxima etapa, com o local.', exemplo: 'Almoço (Restaurante A)' },
  { nome: 'hora_proxima', descricao: 'Chegada estimada na próxima etapa.', exemplo: '12:17' },
  { nome: 'previsao_destino', descricao: 'Chegada prevista no destino, já com o atraso.', exemplo: '23:47 (atraso de 17 min)' },
  { nome: 'destino', descricao: 'Cidade do destino.', exemplo: 'Ribeirão Preto' },
  { nome: 'passageiros', descricao: 'Número de passageiros a bordo (ou esperados na saída). Nunca os nomes.', exemplo: '35 a bordo' },
  { nome: 'agora', descricao: 'Horário em que a mensagem foi gerada.', exemplo: '06:50' },
]

export const VARIAVEIS_DO_RESTAURANTE: readonly VariavelDoModelo[] = [
  { nome: 'grupo', descricao: 'Tamanho do grupo: passageiros a bordo ao chegar (inclusive quem desce ali) mais a equipe.', exemplo: '41' },
  { nome: 'chegada', descricao: 'Chegada prevista naquele local.', exemplo: '12:17' },
  { nome: 'local', descricao: 'Nome do local.', exemplo: 'Restaurante A' },
  { nome: 'identificacao', descricao: 'Identificação da viagem (por exemplo, a unidade).', exemplo: 'Unidade Exemplo — Ipatinga' },
]

export const VARIAVEIS_DO_MODELO: Record<IdModelo, readonly VariavelDoModelo[]> = {
  atualizacao: VARIAVEIS_DA_ATUALIZACAO,
  restaurante: VARIAVEIS_DO_RESTAURANTE,
}

export const TITULO_DO_MODELO: Record<IdModelo, string> = {
  atualizacao: 'Atualização',
  restaurante: 'Restaurante',
}

export const MODELO_PADRAO: Record<IdModelo, string> = {
  atualizacao: [
    '🚌 Atualização da viagem',
    '{identificacao}',
    '',
    'Situação: {situacao}',
    'Próxima parada: {proxima_parada}, às {hora_proxima}',
    'Chegada em {destino}: {previsao_destino}',
    'Passageiros: {passageiros}',
    '',
    'Atualizado às {agora}',
  ].join('\n'),
  restaurante:
    'Olá! Somos um grupo de {grupo} pessoas ({identificacao}), em ônibus, com chegada prevista às {chegada}. Podem nos receber? Se o horário mudar, avisamos.',
}

/** Só `{nome}` com letras, números e sublinhado conta como variável; outra chave é texto comum. */
const VARIAVEL = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g

/** Nomes de variável que o modelo usa e que não existem, sem repetição, na ordem em que aparecem. */
export function variaveisDesconhecidas(modelo: string, validas: readonly VariavelDoModelo[]): string[] {
  const nomes = new Set(validas.map((v) => v.nome))
  const achadas: string[] = []
  for (const m of modelo.matchAll(VARIAVEL)) {
    const nome = m[1] ?? ''
    if (!nomes.has(nome) && !achadas.includes(nome)) achadas.push(nome)
  }
  return achadas
}

/** Validação para salvar: não vazio e sem variável desconhecida. */
export function validarModelo(
  id: IdModelo,
  texto: string,
): { ok: true } | { ok: false; motivo: string } {
  if (texto.trim() === '') return { ok: false, motivo: 'O modelo não pode ficar vazio.' }
  const desconhecidas = variaveisDesconhecidas(texto, VARIAVEIS_DO_MODELO[id])
  if (desconhecidas.length > 0) {
    const lista = desconhecidas.map((n) => `{${n}}`).join(', ')
    return { ok: false, motivo: `${desconhecidas.length === 1 ? 'Variável desconhecida' : 'Variáveis desconhecidas'}: ${lista}.` }
  }
  return { ok: true }
}

/**
 * Preenche o modelo. A linha que contém variável vazia é removida inteira; linhas em branco
 * seguidas viram uma só e o texto é aparado nas pontas.
 */
export function preencherModelo(modelo: string, valores: Readonly<Record<string, string>>): string {
  const linhas: string[] = []
  for (const linha of modelo.replace(/\r\n?/g, '\n').split('\n')) {
    let vazia = false
    const preenchida = linha.replace(VARIAVEL, (inteiro, nome: string) => {
      const valor = valores[nome]
      if (valor === undefined) return inteiro
      if (valor.trim() === '') vazia = true
      return valor
    })
    if (!vazia) linhas.push(preenchida)
  }
  const compactas: string[] = []
  for (const l of linhas) {
    if (l.trim() === '' && compactas.at(-1)?.trim() === '') continue
    compactas.push(l.trimEnd())
  }
  return compactas.join('\n').trim()
}

/**
 * O modelo salvo, se existir e for válido; senão o padrão, avisando quando o salvo tinha
 * variável desconhecida (um modelo antigo ou de outra versão).
 */
export function modeloParaGerar(
  id: IdModelo,
  salvo: string | null | undefined,
): { texto: string; aviso: string | null } {
  if (salvo === null || salvo === undefined) return { texto: MODELO_PADRAO[id], aviso: null }
  const r = validarModelo(id, salvo)
  if (r.ok) return { texto: salvo, aviso: null }
  return { texto: MODELO_PADRAO[id], aviso: `O modelo salvo tem um problema (${r.motivo.replace(/\.$/, '')}); usei o modelo padrão.` }
}
